import type { Sql, Tx } from '../db';
import { insertMany } from '../db';
import { createRng } from '../rng';
import {
  fitScore, generateAiActions, processRecruitingWeek, PRIORITY_KEYS, randomPriorities, type ActionType, type InterestState,
  type PriorityKey, type RecruitState, type TeamContext, type WeekAction,
} from '../recruiting/engine';
import { generateRecruitClass } from '../recruiting/generate';
import { assertCanRecruitFor, assertCommissioner, type Actor } from '../auth/permissions';
import type { Position } from '../players/positions';
import { getSettings } from './settings';
import { logAudit } from './audit';

export class RecruitingError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RecruitingError'; }
}

const toRecruitState = (r: any): RecruitState => ({
  id: r.id, position: r.position, stars: r.stars, overall: r.overall, potential: r.potential, latitude: r.latitude,
  longitude: r.longitude, preferredScheme: r.preferredScheme, priorities: r.priorities, status: r.status,
  committedTeamId: r.committedTeamId, isTransfer: r.isTransfer, fromTeamId: r.fromTeamId,
});
const toInterest = (i: any): InterestState => ({
  recruitId: i.recruitId, teamId: i.teamId, interest: i.interest, relationship: i.relationship, scouted: i.scouted,
  offered: i.offered, offeredWeek: i.offeredWeek, visited: i.visited, visitWeek: i.visitWeek, pitches: i.pitches,
  lastActionWeek: i.lastActionWeek,
});

/** Team context the recruiting engine needs (prestige, success, depth, distance…) */
export async function loadTeamContexts(sql: Tx, seasonId: string): Promise<TeamContext[]> {
  const teams = await sql`
    select t.id, t.prestige, t.coach_rating, t.latitude, t.longitude, t.offense_scheme, t.defense_scheme, t.overall_rating,
      exists (select 1 from team_staff s where s.team_id = t.id and s.role = 'owner') as has_owner,
      coalesce(r.wins, 0) as wins, coalesce(r.losses, 0) as losses
    from teams t left join team_records r on r.team_id = t.id and r.season_id = ${seasonId}
    where t.active order by t.overall_rating desc`;
  const best = await sql`
    select team_id, position, max(overall) as best from players
    where status = 'active' and team_id is not null and seasons_played < 3 group by team_id, position`;
  const commits = await sql`
    select coalesce(signed_team_id, committed_team_id) as team_id, count(*)::int as n from recruits
    where season_id = ${seasonId} and status in ('committed', 'signed') and not is_transfer group by 1`;
  const bestMap = new Map<string, Partial<Record<Position, number>>>();
  for (const b of best) {
    const m = bestMap.get(b.teamId) ?? {};
    m[b.position as Position] = b.best;
    bestMap.set(b.teamId, m);
  }
  const commitMap = new Map(commits.map((c) => [c.teamId as string, c.n as number]));
  const returning = await sql`select team_id, count(*)::int as n from players where status = 'active' and team_id is not null and seasons_played <= 2 group by team_id`;
  const returningMap = new Map(returning.map((r) => [r.teamId as string, r.n as number]));
  const TARGET_ROSTER = 62;
  return teams.map((t, i) => ({
    id: t.id, prestige: t.prestige, coachRating: t.coachRating, latitude: t.latitude, longitude: t.longitude,
    offenseScheme: t.offenseScheme, defenseScheme: t.defenseScheme,
    recentWinPct: t.wins + t.losses ? t.wins / (t.wins + t.losses) : t.prestige / 100,
    powerRank: i + 1, bestAtPosition: bestMap.get(t.id) ?? {}, commits: commitMap.get(t.id) ?? 0, isAi: !t.hasOwner,
    aiTarget: Math.max(8, TARGET_ROSTER - (returningMap.get(t.id) ?? 0)),
  }));
}

/** Generates a high-school class for a season and seeds a few schools of early interest for each prospect */
export async function generateClass(sql: Tx, seasonId: string, count: number, isDemo: boolean) {
  const [season] = await sql`select * from seasons where id = ${seasonId}`;
  const cls = generateRecruitClass(`${seasonId}-class`, count, season.year + 1);
  const inserted: any[] = [];
  for (let i = 0; i < cls.length; i += 400) {
    const part = cls.slice(i, i + 400).map((r) => ({
      seasonId, firstName: r.firstName, lastName: r.lastName, position: r.position, hometown: r.hometown, homeState: r.homeState,
      latitude: r.latitude, longitude: r.longitude, heightIn: r.heightIn, weight: r.weight, classYear: r.classYear, stars: r.stars,
      nationalRank: r.nationalRank, stateRank: r.stateRank, positionRank: r.positionRank, overall: r.overall, potential: r.potential,
      attributes: sql.json(r.attributes), preferredScheme: r.preferredScheme, priorities: sql.json(r.priorities), isDemo,
    }));
    inserted.push(...await sql`insert into recruits ${sql(part as any)} returning *`);
  }
  await seedInitialInterest(sql, seasonId, inserted.map(toRecruitState));
  return inserted.length;
}

async function seedInitialInterest(sql: Tx, seasonId: string, recruits: RecruitState[]) {
  const teams = await loadTeamContexts(sql, seasonId);
  const rng = createRng(`${seasonId}-initial-interest`);
  const rows: Record<string, unknown>[] = [];
  for (const r of recruits) {
    const scored = teams.map((t) => ({ t, f: fitScore(r, t, undefined, teams.length) })).sort((a, b) => b.f - a.f).slice(0, 6);
    for (const { t, f } of scored) {
      rows.push({ recruitId: r.id, teamId: t.id, interest: +(f * 30 + rng.range(0, 8)).toFixed(2), relationship: 0 });
    }
  }
  await insertMany(sql, 'recruit_interest', rows, 1000);
}

async function currentSeason(sql: Tx) {
  const settings = await getSettings(sql);
  if (!settings.currentSeasonId) throw new RecruitingError('No active season');
  const [season] = await sql`select * from seasons where id = ${settings.currentSeasonId}`;
  return { settings, season };
}

export interface SubmitActionInput {
  teamId: string;
  recruitId: string;
  type: ActionType;
  pitchAngle?: PriorityKey | null;
}

/**
 * Owners spend recruiting points on actions. Validated server-side in one
 * transaction with the weekly budget row locked so concurrent submissions
 * can't overspend, and a unique index blocks duplicate actions.
 */
export async function submitRecruitingAction(sql: Sql, actor: Actor, input: SubmitActionInput) {
  return sql.begin(async (tx) => {
    const { settings, season } = await currentSeason(tx);
    assertCanRecruitFor(actor, input.teamId, settings);
    if (season.phase === 'archived') throw new RecruitingError('This season is archived');
    const rules = settings.recruitingRules;
    const [recruit] = await tx`select * from recruits where id = ${input.recruitId} and season_id = ${season.id}`;
    if (!recruit) throw new RecruitingError('Recruit not found in the current recruiting pool');
    if (recruit.status === 'signed' || recruit.status === 'withdrawn') throw new RecruitingError('This recruit is off the board');
    if (!recruit.isTransfer && season.currentWeek > rules.signingDayWeek) throw new RecruitingError('Signing day has passed for this class');
    if (recruit.isTransfer && recruit.fromTeamId === input.teamId) throw new RecruitingError('You cannot recruit your own transfer');
    if (input.type === 'pitch' && (!input.pitchAngle || !PRIORITY_KEYS.includes(input.pitchAngle))) throw new RecruitingError('Choose a pitch angle');
    const cost = rules.costs[input.type] ?? 0;
    const week = season.currentWeek;

    await tx`insert into recruiting_budgets (season_id, week, team_id, points_total)
             values (${season.id}, ${week}, ${input.teamId}, ${rules.weeklyPoints}) on conflict do nothing`;
    // lock this team's weekly budget row: serializes concurrent submissions for the team
    const [budget] = await tx`select * from recruiting_budgets where season_id = ${season.id} and week = ${week} and team_id = ${input.teamId} for update`;
    const [interest] = await tx`select * from recruit_interest where recruit_id = ${recruit.id} and team_id = ${input.teamId}`;
    const pendingOffer = await tx`select 1 from recruiting_actions where season_id = ${season.id} and week = ${week} and team_id = ${input.teamId} and recruit_id = ${recruit.id} and action_type = 'offer' and status in ('pending','approved')`;
    const offered = !!interest?.offered || pendingOffer.length > 0;
    if (input.type === 'offer') {
      if (offered) throw new RecruitingError('You have already offered this recruit');
      const [{ n }] = await tx`select count(*)::int as n from recruit_interest i join recruits r on r.id = i.recruit_id
                               where i.team_id = ${input.teamId} and i.offered and r.season_id = ${season.id} and r.status <> 'signed'`;
      if (n >= rules.maxActiveOffers) throw new RecruitingError(`Offer limit reached (${rules.maxActiveOffers} active offers)`);
      const [{ c }] = await tx`select count(*)::int as c from recruits where season_id = ${season.id} and not is_transfer
                               and coalesce(signed_team_id, committed_team_id) = ${input.teamId} and status in ('committed','signed')`;
      if (!recruit.isTransfer && c >= rules.scholarshipLimit) throw new RecruitingError('No scholarships remaining in this class');
    }
    if (input.type === 'visit') {
      if (!offered) throw new RecruitingError('Offer a scholarship before scheduling an official visit');
      if (interest?.visited) throw new RecruitingError('This recruit has already visited');
      const [{ v }] = await tx`select count(*)::int as v from recruiting_actions where season_id = ${season.id} and week = ${week}
                               and team_id = ${input.teamId} and action_type = 'visit' and status <> 'rejected'`;
      if (v >= rules.maxVisitsPerWeek) throw new RecruitingError(`Only ${rules.maxVisitsPerWeek} official visits per week`);
    }
    if (input.type === 'pull_offer' && !interest?.offered) throw new RecruitingError('There is no offer to pull');

    if (budget.pointsSpent + cost > budget.pointsTotal) throw new RecruitingError(`Not enough recruiting points (${budget.pointsTotal - budget.pointsSpent} left, ${cost} needed)`);

    let action;
    try {
      [action] = await tx`insert into recruiting_actions (season_id, week, team_id, recruit_id, action_type, pitch_angle, points, status, created_by)
                          values (${season.id}, ${week}, ${input.teamId}, ${recruit.id}, ${input.type}, ${input.pitchAngle ?? null}, ${cost}, 'pending', ${actor.userId})
                          returning *`;
    } catch (e: any) {
      if (e?.code === '23505') throw new RecruitingError('You already queued that action for this recruit this week');
      throw e;
    }
    await tx`update recruiting_budgets set points_spent = points_spent + ${cost} where season_id = ${season.id} and week = ${week} and team_id = ${input.teamId}`;
    return action;
  });
}

export async function cancelRecruitingAction(sql: Sql, actor: Actor, actionId: string) {
  return sql.begin(async (tx) => {
    const settings = await getSettings(tx);
    const [a] = await tx`select * from recruiting_actions where id = ${actionId} for update`;
    if (!a) throw new RecruitingError('Action not found');
    assertCanRecruitFor(actor, a.teamId, settings);
    if (a.status !== 'pending' && a.status !== 'approved') throw new RecruitingError('Only queued actions can be cancelled');
    await tx`delete from recruiting_actions where id = ${actionId}`;
    await tx`update recruiting_budgets set points_spent = greatest(0, points_spent - ${a.points}) where season_id = ${a.seasonId} and week = ${a.week} and team_id = ${a.teamId}`;
  });
}

export async function reviewRecruitingAction(sql: Sql, actor: Actor, actionId: string, approve: boolean, note?: string) {
  assertCommissioner(actor);
  return sql.begin(async (tx) => {
    const [a] = await tx`select * from recruiting_actions where id = ${actionId} for update`;
    if (!a || a.status !== 'pending') throw new RecruitingError('Only pending actions can be reviewed');
    await tx`update recruiting_actions set status = ${approve ? 'approved' : 'rejected'}, reviewed_by = ${actor.userId}, result_note = ${note ?? null} where id = ${actionId}`;
    if (!approve) await tx`update recruiting_budgets set points_spent = greatest(0, points_spent - ${a.points}) where season_id = ${a.seasonId} and week = ${a.week} and team_id = ${a.teamId}`;
    await logAudit(tx, actor.userId, approve ? 'recruiting.action_approved' : 'recruiting.action_rejected', 'recruiting_action', actionId, { note });
  });
}

/**
 * Weekly recruiting processing (commissioner, as part of advancing the week).
 * AI programs act, the engine resolves every action and decision, and all
 * interest changes, commitments, flips, decommitments and signings are written
 * in one transaction.
 */
export async function processRecruiting(tx: Tx, seasonId: string, week: number, actorId: string | null) {
  const settings = await getSettings(tx);
  const rules = settings.recruitingRules;
  const [season] = await tx`select * from seasons where id = ${seasonId}`;
  const signingDay = week === rules.signingDayWeek;
  const offseason = season.phase === 'offseason';
  // High-school prospects recruit until signing day; transfers recruit during the offseason window
  const recruitRows = await tx`select * from recruits where season_id = ${seasonId} and status in ('uncommitted', 'committed')
    and ${offseason ? tx`is_transfer` : week <= rules.signingDayWeek ? tx`not is_transfer` : tx`false`}`;
  if (!recruitRows.length) return { processed: 0, events: [] as any[] };
  const ids = recruitRows.map((r) => r.id);
  const interestRows = await tx`select * from recruit_interest where recruit_id in ${tx(ids)}`;
  const teams = await loadTeamContexts(tx, seasonId);
  const recruits = recruitRows.map(toRecruitState);
  const interests = interestRows.map(toInterest);

  // Human actions for this week
  if (rules.requireApproval) {
    await tx`update recruiting_actions set status = 'rejected', result_note = 'Not approved before the weekly deadline'
             where season_id = ${seasonId} and week = ${week} and status = 'pending' and not is_ai`;
  }
  const humanRows = await tx`select * from recruiting_actions where season_id = ${seasonId} and week = ${week}
    and status = ${rules.requireApproval ? 'approved' : 'pending'} and recruit_id in ${tx(ids)} order by created_at`;
  const aiActions = generateAiActions(teams.filter((t) => t.isAi), recruits, interests, rules, week, `${seasonId}`);
  const actions: WeekAction[] = [
    ...humanRows.map((a) => ({ id: a.id, teamId: a.teamId, recruitId: a.recruitId, type: a.actionType, pitchAngle: a.pitchAngle })),
    ...aiActions,
  ];
  const out = processRecruitingWeek({ recruits, interests, teams, actions, rules, week, seed: `${seasonId}`, signingDay: signingDay && !offseason });

  // persist interest
  for (let i = 0; i < out.interests.length; i += 500) {
    const part = out.interests.slice(i, i + 500);
    await tx`insert into recruit_interest ${tx(part.map((x) => ({
      recruitId: x.recruitId, teamId: x.teamId, interest: x.interest, relationship: x.relationship, scouted: x.scouted, offered: x.offered,
      offeredWeek: x.offeredWeek, visited: x.visited, visitWeek: x.visitWeek, pitches: x.pitches, lastActionWeek: x.lastActionWeek,
    })) as any)}
    on conflict (recruit_id, team_id) do update set interest = excluded.interest, relationship = excluded.relationship,
      scouted = excluded.scouted, offered = excluded.offered, offered_week = excluded.offered_week, visited = excluded.visited,
      visit_week = excluded.visit_week, pitches = excluded.pitches, last_action_week = excluded.last_action_week`;
  }
  // recruit status (signed recruits get signed_team_id)
  const signedTo = new Map(out.events.filter((e) => e.event === 'signed').map((e) => [e.recruitId, e.teamId]));
  for (const u of out.recruitUpdates) {
    await tx`update recruits set status = ${u.status}::recruit_status, committed_team_id = ${u.committedTeamId}::uuid,
             committed_week = ${u.committedTeamId ? week : null}::int,
             signed_team_id = ${signedTo.get(u.id) ?? null}
             where id = ${u.id}`;
  }
  if (out.events.length) {
    await insertMany(tx, 'commitments', out.events.map((e) => ({ recruitId: e.recruitId, teamId: e.teamId, previousTeamId: e.previousTeamId, seasonId, week, event: e.event })));
  }
  // action bookkeeping
  for (let i = 0; i < humanRows.length; i++) {
    await tx`update recruiting_actions set status = 'processed', processed_at = now(), result_note = ${out.actionNotes.get(i) ?? null} where id = ${humanRows[i].id}`;
  }
  if (aiActions.length) {
    await insertMany(tx, 'recruiting_actions', aiActions.map((a, j) => ({
      seasonId, week, teamId: a.teamId, recruitId: a.recruitId, actionType: a.type, pitchAngle: a.pitchAngle ?? null,
      points: rules.costs[a.type], status: 'processed', isAi: true, resultNote: out.actionNotes.get(humanRows.length + j) ?? null, processedAt: new Date(),
    })), 1000);
  }
  if (signingDay && !offseason) {
    await tx`update recruits set status = 'withdrawn' where season_id = ${seasonId} and not is_transfer and status = 'uncommitted'`;
  }
  await logAudit(tx, actorId, 'recruiting.week_processed', 'season', seasonId, {
    week, actions: actions.length, commits: out.events.filter((e) => e.event === 'commit').length,
    flips: out.events.filter((e) => e.event === 'flip').length, signed: out.events.filter((e) => e.event === 'signed').length,
  });
  return { processed: actions.length, events: out.events };
}

/** Owner sends one of their players to the transfer portal */
export async function enterPortal(sql: Sql, actor: Actor, playerId: string) {
  return sql.begin(async (tx) => {
    const settings = await getSettings(tx);
    const [p] = await tx`select * from players where id = ${playerId} for update`;
    if (!p || p.status !== 'active' || !p.teamId) throw new RecruitingError('Player is not on an active roster');
    if (!settings.currentSeasonId) throw new RecruitingError('No active season');
    if (actor.role !== 'commissioner') assertCanRecruitFor(actor, p.teamId, settings);
    await createPortalEntry(tx, settings.currentSeasonId, p);
    await logAudit(tx, actor.userId, 'portal.entered', 'player', playerId, { teamId: p.teamId });
  });
}

export async function createPortalEntry(tx: Tx, seasonId: string, p: any) {
  const [season] = await tx`select year, is_demo from seasons where id = ${seasonId}`;
  const [team] = await tx`select latitude, longitude from teams where id = ${p.teamId}`;
  const rng = createRng(`portal-${p.id}-${seasonId}`);
  await tx`update players set status = 'portal' where id = ${p.id}`;
  await tx`delete from depth_chart where player_id = ${p.id}`;
  const [r] = await tx`insert into recruits (season_id, first_name, last_name, position, hometown, home_state, latitude, longitude, height_in, weight,
      class_year, stars, overall, potential, attributes, priorities, is_transfer, source_player_id, from_team_id, is_demo)
    values (${seasonId}, ${p.firstName}, ${p.lastName}, ${p.position}, ${p.hometown ?? 'Unknown'}, ${p.homeState ?? '—'}, ${team?.latitude ?? null}, ${team?.longitude ?? null},
      ${p.heightIn ?? 72}, ${p.weight ?? 200}, ${season.year}, ${p.stars}, ${p.overall}, ${p.potential}, ${tx.json(p.attributes ?? {})},
      ${tx.json(randomPriorities(rng, p.stars))}, true, ${p.id}, ${p.teamId}, ${p.isDemo}) returning *`;
  // a few schools show early interest, as with high-school prospects
  const teams = (await loadTeamContexts(tx, seasonId)).filter((t) => t.id !== p.teamId);
  const state = { ...r, priorities: r.priorities } as any;
  const top = teams.map((t) => ({ t, f: fitScore({ ...state, committedTeamId: null, isTransfer: true, fromTeamId: p.teamId }, t, undefined, teams.length) }))
    .sort((a, b) => b.f - a.f).slice(0, 5);
  await insertMany(tx, 'recruit_interest', top.map(({ t, f }) => ({ recruitId: r.id, teamId: t.id, interest: +(f * 40 + rng.range(0, 10)).toFixed(2), relationship: 0 })));
  return r.id as string;
}
