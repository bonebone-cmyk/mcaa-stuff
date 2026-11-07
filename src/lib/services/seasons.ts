import type { Sql, Tx } from '../db';
import { insertMany } from '../db';
import { createRng } from '../rng';
import { assignBroadcasts, generateSchedule } from '../schedule/generate';
import { computeRecords, sortStandings } from '../standings';
import { selectField } from '../playoffs';
import { developPlayer } from '../development';
import { jerseyFor } from '../players/generate';
import type { Position } from '../players/positions';
import { logAudit } from './audit';
import { getSettings } from './settings';
import { advanceBracket, GameStateError, simulateScheduledGame, type SimModeName } from './games';
import { generateRankings, loadSeasonGames, type PollName } from './rankings';
import { createPortalEntry, generateClass, processRecruiting } from './recruiting';
import { autoDepthChart, refreshTeamRatings } from './teams';

export class SeasonError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SeasonError'; }
}

export interface CreateSeasonInput {
  year: number;
  name?: string;
  regularSeasonWeeks?: number;
  playoffSize?: 4 | 8 | 12 | 16;
  playoffAutoBids?: number;
  isDemo?: boolean;
  makeCurrent?: boolean;
}

export async function createSeason(sql: Tx, input: CreateSeasonInput, actorId: string | null) {
  const [season] = await sql`
    insert into seasons (year, name, regular_season_weeks, playoff_size, playoff_auto_bids, is_demo)
    values (${input.year}, ${input.name ?? `${input.year} Season`}, ${input.regularSeasonWeeks ?? 13}, ${input.playoffSize ?? 12},
            ${input.playoffAutoBids ?? 5}, ${input.isDemo ?? false})
    returning *`;
  await sql`insert into team_seasons (season_id, team_id, conference_id, division_id, preseason_overall)
            select ${season.id}, id, conference_id, division_id, overall_rating from teams where active`;
  if (input.makeCurrent !== false) await sql`update universe_settings set current_season_id = ${season.id}, updated_at = now() where id = 1`;
  await logAudit(sql, actorId, 'season.created', 'season', season.id, { year: input.year, demo: !!input.isDemo });
  return season;
}

/** Generates the full regular season. Refuses if official games already exist (unless replace=true and none are final). */
export async function generateSeasonSchedule(sql: Tx, seasonId: string, actorId: string | null, opts: { replace?: boolean; gamesPerTeam?: number } = {}) {
  const [season] = await sql`select * from seasons where id = ${seasonId}`;
  if (!season) throw new SeasonError('Season not found');
  const existing = await sql`select count(*)::int as n, count(*) filter (where status = 'final')::int as f from games where season_id = ${seasonId} and game_type = 'regular'`;
  if (existing[0].n > 0) {
    if (!opts.replace) throw new SeasonError('This season already has a schedule');
    if (existing[0].f > 0) throw new SeasonError('Cannot regenerate: games have already been played');
    await sql`delete from games where season_id = ${seasonId} and game_type = 'regular'`;
  }
  const teams = await sql`select ts.team_id as id, ts.conference_id, t.prestige from team_seasons ts join teams t on t.id = ts.team_id where ts.season_id = ${seasonId}`;
  const conferences = await sql`select id, conference_games from conferences`;
  const rivalries = await sql`select id, team_a_id, team_b_id, annual from rivalries`;
  const networks = await sql`select id, tier from tv_networks`;
  const games = generateSchedule(
    teams.map((t) => ({ id: t.id, conferenceId: t.conferenceId })),
    conferences.map((c) => ({ id: c.id, conferenceGames: c.conferenceGames })),
    rivalries.map((r) => ({ id: r.id, teamAId: r.teamAId, teamBId: r.teamBId, annual: r.annual })),
    { weeks: season.regularSeasonWeeks, gamesPerTeam: opts.gamesPerTeam ?? Math.min(12, season.regularSeasonWeeks), seed: `${seasonId}-schedule` },
  );
  const withTv = assignBroadcasts(games, new Map(teams.map((t) => [t.id, t.prestige])), networks.map((n) => ({ id: n.id, tier: n.tier })), season.year, seasonId);
  await insertMany(sql, 'games', withTv.map((g) => ({
    seasonId, week: g.week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, gameType: 'regular', isConferenceGame: g.isConferenceGame,
    conferenceId: g.conferenceId, isRivalry: !!g.rivalryId, rivalryId: g.rivalryId, kickoffAt: g.kickoffAt, tvNetworkId: g.tvNetworkId,
    isGameOfWeek: g.isGameOfWeek, isDemo: season.isDemo,
  })));
  await logAudit(sql, actorId, 'season.schedule_generated', 'season', seasonId, { games: withTv.length });
  return withTv.length;
}

/** Simulates every unfinished official game of a week (each game finalizes in its own transaction) */
export async function simulateWeek(sql: Sql, seasonId: string, week: number, mode: SimModeName, actorId: string | null) {
  const games = await sql`select id, is_game_of_week from games where season_id = ${seasonId} and week = ${week} and status = 'scheduled' and game_type <> 'exhibition' order by kickoff_at nulls last`;
  let done = 0;
  for (const g of games) {
    try {
      await simulateScheduledGame(sql, g.id, g.isGameOfWeek ? 'live' : mode, actorId);
      done++;
    } catch (e) {
      if (!(e instanceof GameStateError)) throw e;
    }
  }
  return done;
}

async function conferenceStandings(sql: Tx, seasonId: string) {
  const games = await loadSeasonGames(sql, seasonId);
  const members = await sql`select team_id, conference_id from team_seasons where season_id = ${seasonId} and conference_id is not null`;
  const records = computeRecords(games, members.map((m) => m.teamId as string));
  const byConf = new Map<string, string[]>();
  for (const m of members) byConf.set(m.conferenceId, [...(byConf.get(m.conferenceId) ?? []), m.teamId]);
  const result = new Map<string, string[]>();
  for (const [conf, ids] of byConf) result.set(conf, sortStandings(ids, records, games));
  return { result, records };
}

export async function createConferenceChampionships(sql: Tx, seasonId: string) {
  const [season] = await sql`select * from seasons where id = ${seasonId}`;
  const existing = await sql`select 1 from games where season_id = ${seasonId} and game_type = 'conference_championship' limit 1`;
  if (existing.length) return 0;
  const confs = await sql`select id, short_name, slug from conferences where slug <> 'independent'`;
  const { result } = await conferenceStandings(sql, seasonId);
  let n = 0;
  for (const c of confs) {
    const order = result.get(c.id);
    if (!order || order.length < 4) continue;
    await sql`insert into games (season_id, week, home_team_id, away_team_id, game_type, is_conference_game, conference_id, neutral_site, site_name, is_demo)
              values (${seasonId}, ${season.regularSeasonWeeks + 1}, ${order[0]}, ${order[1]}, 'conference_championship', false, ${c.id}, true,
                      ${`${c.shortName} Championship Game`}, ${season.isDemo})`;
    n++;
  }
  return n;
}

export async function createPlayoff(sql: Tx, seasonId: string, actorId: string | null) {
  const [season] = await sql`select * from seasons where id = ${seasonId}`;
  const existing = await sql`select 1 from playoff_brackets where season_id = ${seasonId}`;
  if (existing.length) throw new SeasonError('A playoff bracket already exists');
  const ranking = await sql`select team_id from rankings where season_id = ${seasonId} and poll = 'playoff'
                            and week = (select max(week) from rankings where season_id = ${seasonId} and poll = 'playoff') order by rank`;
  let ranked = ranking.map((r) => r.teamId as string);
  if (ranked.length < season.playoffSize) {
    const comp = await sql`select team_id from rankings where season_id = ${seasonId} and poll = 'computer'
                           and week = (select max(week) from rankings where season_id = ${seasonId} and poll = 'computer') order by rank`;
    ranked = [...new Set([...ranked, ...comp.map((r) => r.teamId as string)])];
  }
  if (ranked.length < season.playoffSize) throw new SeasonError('Not enough ranked teams to build the bracket — generate rankings first');
  const champs = await sql`select team_id, conference_id from championships where season_id = ${seasonId} and kind = 'conference'`;
  const field = selectField(ranked, champs.map((c) => ({ teamId: c.teamId, conferenceId: c.conferenceId })), season.playoffSize, season.playoffAutoBids);
  const [bracket] = await sql`insert into playoff_brackets (season_id, size, auto_bids) values (${seasonId}, ${season.playoffSize}, ${season.playoffAutoBids}) returning id`;
  await insertMany(sql, 'playoff_seeds', field.map((s) => ({ bracketId: bracket.id, seed: s.seed, teamId: s.teamId, bidType: s.bidType, conferenceId: s.conferenceId })));
  await advanceBracket(sql, seasonId);
  await logAudit(sql, actorId, 'playoff.created', 'season', seasonId, { size: season.playoffSize, seeds: field.map((s) => s.teamId) });
  return field;
}

/**
 * Advances the universe one week: processes recruiting, publishes polls,
 * heals injuries, and moves into championship week / playoffs automatically.
 * The season row is locked so two advances can never run at once.
 */
export async function advanceWeek(sql: Sql, seasonId: string, actorId: string | null, opts: { force?: boolean } = {}) {
  return sql.begin(async (tx) => {
    const [season] = await tx`select * from seasons where id = ${seasonId} for update`;
    if (!season) throw new SeasonError('Season not found');
    if (season.phase === 'archived') throw new SeasonError('Season is archived');
    const week = season.currentWeek;
    const R = season.regularSeasonWeeks;
    if (season.phase !== 'preseason' && season.phase !== 'offseason') {
      const [{ open }] = await tx`select count(*)::int as open from games where season_id = ${seasonId} and week = ${week} and status = 'scheduled' and game_type <> 'exhibition'`;
      if (open > 0 && !opts.force) throw new SeasonError(`${open} game(s) in week ${week} are not final yet. Simulate them first or force the advance.`);
    }

    await processRecruiting(tx, seasonId, week, actorId);
    if (season.phase !== 'offseason') {
      const polls: PollName[] = ['coaches', 'media', 'computer'];
      if (week >= Math.min(9, R) || season.phase !== 'regular' && season.phase !== 'preseason') polls.push('playoff');
      await generateRankings(tx, seasonId, week, polls, null);
    }
    await tx`update players set injury_weeks = greatest(0, injury_weeks - 1),
             injury_type = case when injury_weeks <= 1 then null else injury_type end where injury_weeks > 0`;

    let phase = season.phase as string;
    const next = week + 1;
    if (phase === 'preseason') phase = 'regular';
    else if (phase === 'regular' && next > R) {
      await createConferenceChampionships(tx, seasonId);
      phase = 'conference_championships';
    } else if (phase === 'conference_championships') {
      await createPlayoff(tx, seasonId, actorId);
      phase = 'playoffs';
    }
    await tx`update seasons set current_week = ${next}, phase = ${phase} where id = ${seasonId}`;
    await logAudit(tx, actorId, 'season.week_advanced', 'season', seasonId, { from: week, to: next, phase });
    return { week: next, phase };
  });
}

/**
 * Ends the season: runs signing day if it hasn't happened, snapshots final
 * records into the permanent archive, and opens the transfer portal.
 */
export async function closeSeason(sql: Sql, seasonId: string, actorId: string | null) {
  return sql.begin(async (tx) => {
    const [season] = await tx`select * from seasons where id = ${seasonId} for update`;
    if (!season || season.phase === 'offseason' || season.phase === 'archived') throw new SeasonError('Season is not active');
    const rules = (await getSettings(tx)).recruitingRules;
    const pendingHs = await tx`select 1 from recruits where season_id = ${seasonId} and not is_transfer and status in ('uncommitted','committed') limit 1`;
    if (pendingHs.length) await processRecruiting(tx, seasonId, rules.signingDayWeek, actorId);

    const finalPoll = await tx`select team_id, rank from rankings where season_id = ${seasonId}
      and (poll, week) = (select poll, week from rankings where season_id = ${seasonId} order by week desc, (poll = 'playoff') desc, (poll = 'computer') desc limit 1)`;
    const rankOf = new Map(finalPoll.map((r) => [r.teamId as string, r.rank as number]));
    const records = await tx`select * from team_records where season_id = ${seasonId}`;
    for (const r of records) {
      await tx`update team_seasons set final_wins = ${r.wins}, final_losses = ${r.losses}, final_conf_wins = ${r.confWins},
               final_conf_losses = ${r.confLosses}, final_rank = ${rankOf.get(r.teamId) ?? null}
               where season_id = ${seasonId} and team_id = ${r.teamId}`;
    }
    // Transfer portal entries
    const rng = createRng(`${seasonId}-portal`);
    const players = await tx`
      select p.*, coalesce(d.depth, 99) as depth from players p
      left join depth_chart d on d.player_id = p.id and d.slot = p.position
      where p.status = 'active' and p.team_id is not null and p.seasons_played <= 2`;
    let portal = 0;
    for (const p of players) {
      const buried = p.depth > 3 ? 0.07 : p.depth > 2 ? 0.035 : 0.012;
      if (rng.chance(buried + (p.stars >= 4 && p.depth > 2 ? 0.05 : 0))) {
        await createPortalEntry(tx, seasonId, p);
        portal++;
      }
    }
    await tx`update seasons set phase = 'offseason', current_week = current_week + 1 where id = ${seasonId}`;
    await logAudit(tx, actorId, 'season.closed', 'season', seasonId, { portalEntries: portal });
    return { portal };
  });
}

/**
 * Offseason → new season: player development, redshirts and graduation,
 * signed recruits and transfers join their new rosters, the old season is
 * archived (still fully browsable) and a new season with a new schedule and
 * recruiting class begins.
 */
export async function startNewSeason(sql: Sql, fromSeasonId: string, actorId: string | null, opts: { classSize?: number } = {}) {
  return sql.begin(async (tx) => {
    const [old] = await tx`select * from seasons where id = ${fromSeasonId} for update`;
    if (!old || old.phase !== 'offseason') throw new SeasonError('Close the current season before starting a new one');
    const rng = createRng(`${fromSeasonId}-offseason`);

    // 1. development, redshirts, graduation
    const players = await tx`
      select p.*, t.coach_rating,
        (select count(*)::int from player_game_stats s join games g on g.id = s.game_id
          where s.player_id = p.id and g.season_id = ${fromSeasonId} and g.status = 'final' and g.game_type <> 'exhibition') as games_played,
        coalesce((select sum(s.pass_yds + s.rush_yds + s.rec_yds + s.tackles * 12 + s.sacks * 30 + s.def_int * 40 + s.fgm * 15)
          from player_game_stats s join games g on g.id = s.game_id where s.player_id = p.id and g.season_id = ${fromSeasonId}), 0) as production
      from players p join teams t on t.id = p.team_id where p.status = 'active'`;
    const byPos = new Map<string, number[]>();
    for (const p of players) byPos.set(p.position, [...(byPos.get(p.position) ?? []), Number(p.production)]);
    for (const v of byPos.values()) v.sort((a, b) => a - b);
    const pct = (pos: string, v: number) => {
      const arr = byPos.get(pos)!;
      let i = 0;
      while (i < arr.length && arr[i] <= v) i++;
      return arr.length ? i / arr.length : 0.5;
    };
    let graduated = 0;
    for (const p of players) {
      const r = developPlayer({
        id: p.id, position: p.position as Position, overall: p.overall, potential: p.potential, attributes: p.attributes ?? {},
        devTrait: p.devTrait, seasonsPlayed: p.seasonsPlayed, yearsInProgram: p.yearsInProgram, redshirtUsed: p.redshirtUsed,
        gamesPlayed: p.gamesPlayed, performance: pct(p.position, Number(p.production)),
      }, p.coachRating, rng);
      await tx`update players set overall = ${r.overall}, attributes = ${tx.json(r.attributes)}, seasons_played = ${Math.min(r.seasonsPlayed, 6)},
               years_in_program = ${r.yearsInProgram}, redshirt_used = ${r.redshirtUsed}, injury_weeks = 0, injury_type = null,
               status = ${r.graduated ? 'graduated' : 'active'} where id = ${p.id}`;
      if (r.change !== 0) await tx`insert into player_development_log (player_id, season_id, old_overall, new_overall, note)
                                   values (${p.id}, ${fromSeasonId}, ${p.overall}, ${r.overall}, ${r.redshirted ? 'Redshirt season' : null})`;
      if (r.graduated) { graduated++; await tx`delete from depth_chart where player_id = ${p.id}`; }
    }

    // 2. signed high-school recruits join rosters
    const signed = await tx`select * from recruits where season_id = ${fromSeasonId} and status = 'signed' and not is_transfer`;
    const jerseys = new Map<string, Set<number>>();
    const usedFor = async (teamId: string) => {
      if (!jerseys.has(teamId)) {
        const rows = await tx`select jersey from players where team_id = ${teamId} and status = 'active' and jersey is not null`;
        jerseys.set(teamId, new Set(rows.map((r) => r.jersey as number)));
      }
      return jerseys.get(teamId)!;
    };
    for (const r of signed) {
      const used = await usedFor(r.signedTeamId);
      await tx`insert into players (first_name, last_name, position, team_id, jersey, height_in, weight, hometown, home_state, stars, overall, potential,
                 attributes, recruit_id, is_demo, dev_trait)
               values (${r.firstName}, ${r.lastName}, ${r.position}, ${r.signedTeamId}, ${jerseyFor(rng, r.position, used)}, ${r.heightIn}, ${r.weight},
                 ${r.hometown}, ${r.homeState}, ${r.stars}, ${r.overall}, ${r.potential}, ${tx.json(r.attributes)}, ${r.id}, ${r.isDemo},
                 ${rng.weighted(['normal', 'impact', 'star', 'elite'], (t) => ({ normal: 70, impact: 20, star: 8, elite: 2 })[t] ?? 1)})`;
    }
    // 3. transfers: committed → new team, others return to their school
    const transfers = await tx`select * from recruits where season_id = ${fromSeasonId} and is_transfer and source_player_id is not null`;
    for (const t of transfers) {
      if (t.committedTeamId && (t.status === 'committed' || t.status === 'signed')) {
        const used = await usedFor(t.committedTeamId);
        await tx`update players set team_id = ${t.committedTeamId}, status = 'active', jersey = ${jerseyFor(rng, t.position, used)} where id = ${t.sourcePlayerId}`;
        await tx`insert into player_transfers (player_id, season_id, from_team_id, to_team_id) values (${t.sourcePlayerId}, ${fromSeasonId}, ${t.fromTeamId}, ${t.committedTeamId})`;
        await tx`update recruits set status = 'signed', signed_team_id = ${t.committedTeamId} where id = ${t.id}`;
        await tx`insert into commitments (recruit_id, team_id, season_id, week, event) values (${t.id}, ${t.committedTeamId}, ${fromSeasonId}, ${old.currentWeek}, 'signed')`;
      } else if (t.status === 'uncommitted' && (await tx`select 1 from recruit_interest where recruit_id = ${t.id} and offered limit 1`).length) {
        // unresolved transfer with offers picks the most interested school that offered
        const [best] = await tx`select team_id from recruit_interest where recruit_id = ${t.id} and offered order by interest desc limit 1`;
        const used = await usedFor(best.teamId);
        await tx`update players set team_id = ${best.teamId}, status = 'active', jersey = ${jerseyFor(rng, t.position, used)} where id = ${t.sourcePlayerId}`;
        await tx`insert into player_transfers (player_id, season_id, from_team_id, to_team_id) values (${t.sourcePlayerId}, ${fromSeasonId}, ${t.fromTeamId}, ${best.teamId})`;
        await tx`update recruits set status = 'signed', committed_team_id = ${best.teamId}, signed_team_id = ${best.teamId} where id = ${t.id}`;
        await tx`insert into commitments (recruit_id, team_id, season_id, week, event) values (${t.id}, ${best.teamId}, ${fromSeasonId}, ${old.currentWeek}, 'signed')`;
      } else {
        await tx`update players set status = 'active' where id = ${t.sourcePlayerId} and status = 'portal'`;
        await tx`update recruits set status = 'withdrawn' where id = ${t.id}`;
      }
    }

    // 4. program prestige drifts with results
    const ts = await tx`select * from team_seasons where season_id = ${fromSeasonId}`;
    for (const s of ts) {
      const w = s.finalWins ?? 0;
      const l = s.finalLosses ?? 0;
      const delta = Math.round(((w + l ? w / (w + l) : 0.5) - 0.5) * 6 + (s.conferenceChampion ? 2 : 0) + (s.nationalChampion ? 4 : 0) + (s.finalRank ? (26 - s.finalRank) / 10 : 0));
      if (delta) await tx`update teams set prestige = greatest(1, least(100, prestige + ${delta})) where id = ${s.teamId}`;
    }

    // 5. archive & create the new season
    await tx`update seasons set phase = 'archived', archived_at = now() where id = ${fromSeasonId}`;
    const teams = await tx`select id from teams where active`;
    for (const t of teams) await autoDepthChart(tx, t.id, true);
    await refreshTeamRatings(tx);
    const season = await createSeason(tx, { year: old.year + 1, regularSeasonWeeks: old.regularSeasonWeeks, playoffSize: old.playoffSize, playoffAutoBids: old.playoffAutoBids, isDemo: old.isDemo }, actorId);
    await generateSeasonSchedule(tx, season.id, actorId);
    await generateClass(tx, season.id, opts.classSize ?? 2000, old.isDemo);
    await logAudit(tx, actorId, 'season.started', 'season', season.id, { year: old.year + 1, graduated, signed: signed.length });
    return { seasonId: season.id as string, graduated, signed: signed.length };
  });
}

/** Removes every demo record (season data, players, recruits, articles) so the official universe starts clean */
export async function purgeDemoData(sql: Sql, actorId: string) {
  return sql.begin(async (tx) => {
    await tx`delete from articles where is_demo`;
    await tx`delete from team_timeline_events where game_id in (select id from games where is_demo)`;
    await tx`delete from seasons where is_demo`;
    await tx`delete from players where is_demo`;
    await tx`update teams set overall_rating = 60, offense_rating = 60, defense_rating = 60`;
    await logAudit(tx, actorId, 'demo.purged', 'universe', null, {});
  });
}
