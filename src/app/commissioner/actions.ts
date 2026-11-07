'use server';
import { revalidatePath } from 'next/cache';
import { getSql } from '@/lib/db';
import { requireCommissionerActor } from '@/lib/auth/session';
import { bool, num, runAction, str, type ActionState } from '@/lib/actions';
import { logAudit } from '@/lib/services/audit';
import { getSettings } from '@/lib/services/settings';
import { createExhibition, enterManualResult, reopenGame, simulateScheduledGame, type SimModeName } from '@/lib/services/games';
import { advanceWeek, closeSeason, createSeason, generateSeasonSchedule, purgeDemoData, simulateWeek, startNewSeason } from '@/lib/services/seasons';
import { generateRankings, setManualRanking, type PollName } from '@/lib/services/rankings';
import { generateClass, reviewRecruitingAction } from '@/lib/services/recruiting';
import { autoDepthChart, generateRoster, refreshTeamRatings, slugify } from '@/lib/services/teams';
import { DEFAULT_SIM_SETTINGS, type SimSettings } from '@/lib/sim/types';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES } from '@/lib/players/positions';

type A = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const MODES: SimModeName[] = ['quick', 'detailed', 'live'];
const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const done = (paths: string[] = ['/']) => { for (const p of paths) revalidatePath(p, 'layout'); };

async function currentSeasonId() {
  const s = await getSettings(getSql());
  if (!s.currentSeasonId) throw new Error('Create a season first.');
  return s.currentSeasonId;
}

// ------------------------------------------------------------------ games
export const simulateGameAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const mode = str(fd, 'mode') as SimModeName;
  if (!MODES.includes(mode)) throw new Error('Unknown simulation mode');
  const gameId = str(fd, 'gameId');
  const g = await simulateScheduledGame(getSql(), gameId, mode, actor.userId, str(fd, 'seed') || null);
  done();
  return { ok: true, message: `Final: ${g.awayScore}-${g.homeScore}`, data: mode === 'live' ? { redirect: `/games/${gameId}/live` } : undefined };
});

export const manualResultAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const parseQ = (k: string) => str(fd, k) ? str(fd, k).split(/[,\s]+/).filter(Boolean).map(Number) : undefined;
  const stat = (side: string) => ({
    passYards: num(fd, `${side}PassYards`, 0), rushYards: num(fd, `${side}RushYards`, 0), turnovers: num(fd, `${side}Turnovers`, 0),
    firstDowns: num(fd, `${side}FirstDowns`, 0),
  });
  await enterManualResult(getSql(), str(fd, 'gameId'), {
    homeScore: num(fd, 'homeScore'), awayScore: num(fd, 'awayScore'), homeQuarters: parseQ('homeQuarters'), awayQuarters: parseQ('awayQuarters'),
    notes: str(fd, 'notes') || null, stats: { home: stat('home'), away: stat('away') },
  }, actor.userId);
  done();
  return 'Result recorded.';
});

export const reopenGameAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const reason = str(fd, 'reason');
  if (!reason) throw new Error('Give a reason for the override (it is written to the audit log).');
  await reopenGame(getSql(), str(fd, 'gameId'), actor.userId, reason);
  done();
  return 'Game reopened. It can now be re-simulated or re-entered.';
});

export const exhibitionAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const mode = (str(fd, 'mode') || 'live') as SimModeName;
  const id = await createExhibition(sql, str(fd, 'homeId'), str(fd, 'awayId'), bool(fd, 'neutral'), actor.userId);
  await simulateScheduledGame(sql, id, MODES.includes(mode) ? mode : 'live', actor.userId, str(fd, 'seed') || null);
  return { ok: true, message: 'Exhibition simulated.', data: { redirect: mode === 'live' ? `/games/${id}/live` : `/games/${id}` } };
});

export const simulateWeekAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const seasonId = await currentSeasonId();
  const [season] = await sql`select current_week from seasons where id = ${seasonId}`;
  const mode = (str(fd, 'mode') || 'detailed') as SimModeName;
  const n = await simulateWeek(sql, seasonId, season.currentWeek, MODES.includes(mode) ? mode : 'detailed', actor.userId);
  done();
  return `${n} game(s) simulated.`;
});

export const advanceWeekAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const r = await advanceWeek(getSql(), await currentSeasonId(), actor.userId, { force: bool(fd, 'force') });
  done();
  return `Advanced to week ${r.week} (${r.phase.replace('_', ' ')}). Recruiting processed and polls published.`;
});

export const closeSeasonAction: A = async () => runAction(async () => {
  const actor = await requireCommissionerActor();
  const r = await closeSeason(getSql(), await currentSeasonId(), actor.userId);
  done();
  return `Season closed and archived snapshot saved. ${r.portal} players entered the transfer portal.`;
});

export const startNewSeasonAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const r = await startNewSeason(getSql(), await currentSeasonId(), actor.userId, { classSize: num(fd, 'classSize', 2000) });
  done();
  return `New season started: ${r.graduated} players graduated, ${r.signed} signees joined rosters.`;
});

export const createSeasonAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const size = num(fd, 'playoffSize', 12);
  if (![4, 8, 12, 16].includes(size)) throw new Error('Playoff size must be 4, 8, 12 or 16');
  const season = await sql.begin(async (tx) => {
    const s = await createSeason(tx, {
      year: num(fd, 'year'), name: str(fd, 'name') || undefined, regularSeasonWeeks: num(fd, 'weeks', 13),
      playoffSize: size as 4 | 8 | 12 | 16, playoffAutoBids: num(fd, 'autoBids', 5), isDemo: false,
    }, actor.userId);
    if (bool(fd, 'schedule')) await generateSeasonSchedule(tx, s.id, actor.userId);
    if (bool(fd, 'recruits')) await generateClass(tx, s.id, num(fd, 'classSize', 2000), false);
    return s;
  });
  done();
  return `${season.name} created and set as the current season.`;
});

export const generateScheduleAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const n = await generateSeasonSchedule(getSql(), str(fd, 'seasonId') || await currentSeasonId(), actor.userId, { replace: bool(fd, 'replace') });
  done();
  return `${n} games scheduled.`;
});

export const saveGameAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const gameId = str(fd, 'gameId');
  const kickoff = str(fd, 'kickoffAt') ? new Date(str(fd, 'kickoffAt')) : null;
  const network = str(fd, 'tvNetworkId') || null;
  if (gameId) {
    await sql`update games set kickoff_at = ${kickoff}, tv_network_id = ${network}, neutral_site = ${bool(fd, 'neutral')},
              site_name = ${str(fd, 'siteName') || null}, is_game_of_week = ${bool(fd, 'gotw')} where id = ${gameId}`;
    await logAudit(sql, actor.userId, 'game.updated', 'game', gameId, {});
    done();
    return 'Game updated.';
  }
  const seasonId = await currentSeasonId();
  const home = str(fd, 'homeId');
  const away = str(fd, 'awayId');
  if (!home || !away || home === away) throw new Error('Pick two different teams');
  const [ht] = await sql`select conference_id from teams where id = ${home}`;
  const [at] = await sql`select conference_id from teams where id = ${away}`;
  const [rv] = await sql`select id from rivalries where least(team_a_id, team_b_id) = least(${home}::uuid, ${away}::uuid) and greatest(team_a_id, team_b_id) = greatest(${home}::uuid, ${away}::uuid)`;
  const conf = !!ht?.conferenceId && ht.conferenceId === at?.conferenceId;
  const [season] = await sql`select is_demo from seasons where id = ${seasonId}`;
  const [g] = await sql`insert into games (season_id, week, home_team_id, away_team_id, is_conference_game, conference_id, is_rivalry, rivalry_id,
      neutral_site, site_name, kickoff_at, tv_network_id, is_game_of_week, is_demo)
    values (${seasonId}, ${num(fd, 'week')}, ${home}, ${away}, ${conf}, ${conf ? ht.conferenceId : null}, ${!!rv}, ${rv?.id ?? null},
      ${bool(fd, 'neutral')}, ${str(fd, 'siteName') || null}, ${kickoff}, ${network}, ${bool(fd, 'gotw')}, ${season.isDemo}) returning id`;
  await logAudit(sql, actor.userId, 'game.created', 'game', g.id, { home, away, week: num(fd, 'week') });
  done();
  return 'Game scheduled.';
});

export const deleteGameAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const [g] = await sql`delete from games where id = ${str(fd, 'gameId')} and status = 'scheduled' returning id`;
  if (!g) throw new Error('Only scheduled (unplayed) games can be deleted. Reopen a final game first.');
  await logAudit(sql, actor.userId, 'game.deleted', 'game', g.id, {});
  done();
  return 'Game deleted.';
});

export const saveNetworkAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const id = str(fd, 'id');
  const vals = { name: str(fd, 'name'), shortName: str(fd, 'shortName'), tier: num(fd, 'tier', 2), logoUrl: str(fd, 'logoUrl') || null };
  if (!vals.name || !vals.shortName) throw new Error('Name and short name are required');
  if (id) await sql`update tv_networks set ${sql(vals)} where id = ${id}`;
  else await sql`insert into tv_networks ${sql(vals)}`;
  await logAudit(sql, actor.userId, id ? 'network.updated' : 'network.created', 'tv_network', id || null, vals);
  done();
  return 'Network saved.';
});

// ------------------------------------------------------------------ teams & conferences
export const saveTeamAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const id = str(fd, 'id');
  const school = str(fd, 'school');
  if (!school) throw new Error('School name is required');
  const off = str(fd, 'offenseScheme');
  const def = str(fd, 'defenseScheme');
  const vals = {
    school, mascot: str(fd, 'mascot') || 'Team', abbreviation: (str(fd, 'abbreviation') || school.slice(0, 4)).toUpperCase().slice(0, 6),
    logoUrl: str(fd, 'logoUrl') || null, primaryColor: hex(str(fd, 'primaryColor'), '#333333'), secondaryColor: hex(str(fd, 'secondaryColor'), '#ffffff'),
    conferenceId: str(fd, 'conferenceId') || null, city: str(fd, 'city') || null, state: str(fd, 'state') || null,
    latitude: str(fd, 'latitude') ? num(fd, 'latitude') : null, longitude: str(fd, 'longitude') ? num(fd, 'longitude') : null,
    stadium: str(fd, 'stadium') || null, stadiumCapacity: str(fd, 'stadiumCapacity') ? num(fd, 'stadiumCapacity') : null,
    homeFieldRating: Math.max(0, Math.min(100, num(fd, 'homeFieldRating', 50))), prestige: Math.max(1, Math.min(100, num(fd, 'prestige', 50))),
    coachName: str(fd, 'coachName') || null, coachRating: Math.max(1, Math.min(99, num(fd, 'coachRating', 60))),
    offenseScheme: (OFFENSE_SCHEMES as readonly string[]).includes(off) ? off : 'spread',
    defenseScheme: (DEFENSE_SCHEMES as readonly string[]).includes(def) ? def : '4-3',
    updatedAt: new Date(),
  };
  if (id) {
    await sql`update teams set ${sql(vals)} where id = ${id}`;
    await logAudit(sql, actor.userId, 'team.updated', 'team', id, { school });
  } else {
    let slug = slugify(str(fd, 'slug') || school);
    if ((await sql`select 1 from teams where slug = ${slug}`).length) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const [t] = await sql`insert into teams ${sql({ ...vals, slug, isCustom: true })} returning id`;
    const settings = await getSettings(sql);
    if (settings.currentSeasonId) await sql`insert into team_seasons (season_id, team_id, conference_id) values (${settings.currentSeasonId}, ${t.id}, ${vals.conferenceId}) on conflict do nothing`;
    await logAudit(sql, actor.userId, 'team.created', 'team', t.id, { school });
  }
  done();
  return 'Team saved.';
});

export const deleteTeamAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const id = str(fd, 'id');
  const [{ n }] = await sql`select count(*)::int as n from games where home_team_id = ${id} or away_team_id = ${id}`;
  if (n > 0) {
    await sql`update teams set active = false where id = ${id}`;
    await logAudit(sql, actor.userId, 'team.deactivated', 'team', id, { reason: 'has game history' });
    done();
    return 'Team has game history, so it was deactivated (history preserved) instead of deleted.';
  }
  await sql`delete from teams where id = ${id}`;
  await logAudit(sql, actor.userId, 'team.deleted', 'team', id, {});
  done();
  return { ok: true, message: 'Team deleted.', data: { redirect: '/commissioner/teams' } };
});

export const uploadLogoAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) throw new Error('Choose an image');
  if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) throw new Error('Logo must be PNG, JPG, WEBP, GIF or SVG');
  if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be under 2 MB');
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error('Storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing).');
  const teamId = str(fd, 'teamId');
  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1];
  const path = `logos/${teamId}-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from('media').upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const url = admin.storage.from('media').getPublicUrl(path).data.publicUrl;
  await getSql()`update teams set logo_url = ${url} where id = ${teamId}`;
  await logAudit(getSql(), actor.userId, 'team.logo_uploaded', 'team', teamId, { url });
  done();
  return 'Logo uploaded.';
});

export const generateRosterAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const [t] = await sql`select id, prestige, state from teams where id = ${str(fd, 'teamId')}`;
  if (!t) throw new Error('Team not found');
  const [{ n }] = await sql`select count(*)::int as n from players where team_id = ${t.id} and status = 'active'`;
  if (n > 0 && !bool(fd, 'replace')) throw new Error(`This team already has ${n} active players. Tick "replace" to release them first.`);
  await sql.begin(async (tx) => {
    if (n > 0) await tx`update players set status = 'departed', team_id = null where team_id = ${t.id} and status = 'active'`;
    await generateRoster(tx, t as any, { isDemo: false, seed: `${Date.now()}` });
    await refreshTeamRatings(tx, [t.id]);
    await logAudit(tx, actor.userId, 'team.roster_generated', 'team', t.id, { replaced: n });
  });
  done();
  return 'Fictional roster generated.';
});

export const assignStaffAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  const role = str(fd, 'role') === 'assistant' ? 'assistant' : 'owner';
  const email = str(fd, 'email').toLowerCase();
  const [user] = await sql`select u.id from auth.users u where lower(u.email) = ${email}`;
  if (!user) throw new Error('No account with that email. Ask them to sign up first.');
  await sql.begin(async (tx) => {
    if (role === 'owner') {
      await tx`delete from team_staff where team_id = ${teamId} and role = 'owner'`;
      const [other] = await tx`select t.school from team_staff s join teams t on t.id = s.team_id where s.user_id = ${user.id} and s.role = 'owner'`;
      if (other) throw new Error(`That user already owns ${other.school}. Remove them there first.`);
    }
    await tx`insert into team_staff (team_id, user_id, role) values (${teamId}, ${user.id}, ${role})
             on conflict (team_id, user_id) do update set role = excluded.role`;
    await tx`update profiles set role = 'owner' where id = ${user.id} and role = 'viewer'`;
    await logAudit(tx, actor.userId, 'team.staff_assigned', 'team', teamId, { email, role });
  });
  done();
  return `${email} assigned as ${role === 'owner' ? 'head coach / owner' : 'assistant coach'}.`;
});

export const removeStaffAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  const userId = str(fd, 'userId');
  await sql`delete from team_staff where team_id = ${teamId} and user_id = ${userId}`;
  await sql`update profiles set role = 'viewer' where id = ${userId} and role = 'owner' and not exists (select 1 from team_staff where user_id = ${userId})`;
  await logAudit(sql, actor.userId, 'team.staff_removed', 'team', teamId, { userId });
  done();
  return 'Staff member removed.';
});

export const setUserRoleAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const role = str(fd, 'role');
  if (!['commissioner', 'owner', 'viewer'].includes(role)) throw new Error('Invalid role');
  const userId = str(fd, 'userId');
  if (userId === actor.userId && role !== 'commissioner') {
    const [{ n }] = await sql`select count(*)::int as n from profiles where role = 'commissioner'`;
    if (n <= 1) throw new Error('You are the only commissioner — promote someone else first.');
  }
  await sql`update profiles set role = ${role} where id = ${userId}`;
  if (role === 'viewer') await sql`delete from team_staff where user_id = ${userId}`;
  await logAudit(sql, actor.userId, 'user.role_changed', 'profile', userId, { role });
  done();
  return 'Role updated.';
});

export const saveConferenceAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const id = str(fd, 'id');
  const vals = { name: str(fd, 'name'), shortName: str(fd, 'shortName') || str(fd, 'name'), logoUrl: str(fd, 'logoUrl') || null, conferenceGames: Math.max(0, Math.min(13, num(fd, 'conferenceGames', 8))) };
  if (!vals.name) throw new Error('Name is required');
  if (id) await sql`update conferences set ${sql(vals)} where id = ${id}`;
  else await sql`insert into conferences ${sql({ ...vals, slug: slugify(str(fd, 'slug') || vals.shortName), isCustom: true })}`;
  await logAudit(sql, actor.userId, id ? 'conference.updated' : 'conference.created', 'conference', id || null, vals);
  done();
  return 'Conference saved.';
});

export const deleteConferenceAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const id = str(fd, 'id');
  const [{ n }] = await sql`select count(*)::int as n from teams where conference_id = ${id} and active`;
  if (n) throw new Error('Move its teams to another conference first.');
  await sql`delete from conferences where id = ${id}`;
  await logAudit(sql, actor.userId, 'conference.deleted', 'conference', id, {});
  done();
  return 'Conference deleted.';
});

export const saveRivalryAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const a = str(fd, 'teamAId');
  const b = str(fd, 'teamBId');
  if (!a || !b || a === b) throw new Error('Pick two different teams');
  await sql`insert into rivalries (name, team_a_id, team_b_id, trophy, description, annual) values (${str(fd, 'name')}, ${a}, ${b}, ${str(fd, 'trophy') || null}, ${str(fd, 'description') || null}, ${bool(fd, 'annual')})`;
  await logAudit(sql, actor.userId, 'rivalry.created', 'rivalry', null, { name: str(fd, 'name') });
  done();
  return 'Rivalry created.';
});

export const deleteRivalryAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  await getSql()`delete from rivalries where id = ${str(fd, 'id')}`;
  await logAudit(getSql(), actor.userId, 'rivalry.deleted', 'rivalry', str(fd, 'id'), {});
  done();
  return 'Rivalry removed.';
});

// ------------------------------------------------------------------ settings
export const saveSimSettingsAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const s: SimSettings = { ...DEFAULT_SIM_SETTINGS };
  for (const k of Object.keys(DEFAULT_SIM_SETTINGS) as (keyof SimSettings)[]) s[k] = Math.max(0, Math.min(100, num(fd, k, DEFAULT_SIM_SETTINGS[k])));
  const sql = getSql();
  await sql`update universe_settings set sim_settings = ${sql.json(s as any)}, updated_at = now() where id = 1`;
  await logAudit(sql, actor.userId, 'settings.simulation', 'universe', null, s as any);
  return 'Simulation settings saved. They apply to every future simulation.';
});

export const saveUniverseSettingsAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  await sql`update universe_settings set name = ${str(fd, 'name') || 'College Football Universe'}, allow_assistant_coaches = ${bool(fd, 'allowAssistantCoaches')},
            allow_owner_lore = ${bool(fd, 'allowOwnerLore')}, comments_enabled = ${bool(fd, 'commentsEnabled')}, updated_at = now() where id = 1`;
  await logAudit(sql, actor.userId, 'settings.universe', 'universe', null, {});
  done();
  return 'Universe settings saved.';
});

export const saveRecruitingRulesAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const cur = (await getSettings(sql)).recruitingRules;
  const rules = {
    ...cur,
    weeklyPoints: num(fd, 'weeklyPoints', cur.weeklyPoints), scholarshipLimit: num(fd, 'scholarshipLimit', cur.scholarshipLimit),
    maxActiveOffers: num(fd, 'maxActiveOffers', cur.maxActiveOffers), maxVisitsPerWeek: num(fd, 'maxVisitsPerWeek', cur.maxVisitsPerWeek),
    signingDayWeek: num(fd, 'signingDayWeek', cur.signingDayWeek), commitThreshold: num(fd, 'commitThreshold', cur.commitThreshold),
    flipMargin: num(fd, 'flipMargin', cur.flipMargin), requireApproval: bool(fd, 'requireApproval'),
    costs: {
      scout: num(fd, 'cost_scout', cur.costs.scout), contact: num(fd, 'cost_contact', cur.costs.contact), offer: num(fd, 'cost_offer', cur.costs.offer),
      visit: num(fd, 'cost_visit', cur.costs.visit), pitch: num(fd, 'cost_pitch', cur.costs.pitch), pull_offer: 0,
    },
  };
  await sql`update universe_settings set recruiting_rules = ${sql.json(rules as any)}, updated_at = now() where id = 1`;
  await logAudit(sql, actor.userId, 'settings.recruiting', 'universe', null, rules as any);
  done();
  return 'Recruiting rules saved.';
});

// ------------------------------------------------------------------ rankings & recruiting
export const generateRankingsAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const seasonId = await currentSeasonId();
  const [season] = await sql`select current_week from seasons where id = ${seasonId}`;
  const polls = (['coaches', 'media', 'computer', 'playoff'] as PollName[]).filter((p) => bool(fd, p));
  if (!polls.length) throw new Error('Select at least one poll');
  const week = str(fd, 'week') ? num(fd, 'week') : Math.max(0, season.currentWeek - 1);
  await sql.begin((tx) => generateRankings(tx, seasonId, week, polls, actor.userId));
  done();
  return `Generated ${polls.join(', ')} for week ${week}.`;
});

export const manualRankingAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const seasonId = await currentSeasonId();
  const poll = str(fd, 'poll') as PollName;
  const lines = str(fd, 'teams').split('\n').map((l) => l.trim()).filter(Boolean);
  const teams = await sql`select id, slug, school, abbreviation from teams`;
  const ids = lines.map((l) => {
    const key = l.replace(/^\d+[.)]?\s*/, '').toLowerCase();
    const t = teams.find((x) => x.slug === key || x.school.toLowerCase() === key || x.abbreviation.toLowerCase() === key);
    if (!t) throw new Error(`Unknown team: "${l}"`);
    return t.id as string;
  });
  if (ids.length < 1 || ids.length > 25) throw new Error('Enter between 1 and 25 teams, one per line');
  await sql.begin((tx) => setManualRanking(tx, seasonId, num(fd, 'week'), poll, ids, actor.userId));
  done();
  return 'Poll saved as a manual (commissioner) ranking.';
});

export const reviewRecruitingActionAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  await reviewRecruitingAction(getSql(), actor, str(fd, 'actionId'), str(fd, 'decision') === 'approve', str(fd, 'note') || undefined);
  done(['/commissioner']);
  return 'Reviewed.';
});

export const generateClassAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const seasonId = await currentSeasonId();
  const [{ n }] = await sql`select count(*)::int as n from recruits where season_id = ${seasonId} and not is_transfer`;
  if (n > 0) throw new Error('This season already has a recruiting class.');
  const [season] = await sql`select is_demo from seasons where id = ${seasonId}`;
  const count = await sql.begin((tx) => generateClass(tx, seasonId, Math.min(4000, num(fd, 'count', 2000)), season.isDemo));
  await logAudit(sql, actor.userId, 'recruiting.class_generated', 'season', seasonId, { count });
  done();
  return `${count} prospects generated.`;
});

export const purgeDemoAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  if (str(fd, 'confirm') !== 'DELETE DEMO') throw new Error('Type DELETE DEMO to confirm.');
  await purgeDemoData(getSql(), actor.userId);
  done();
  return 'All demo data deleted. Create a season and generate rosters to begin the official universe.';
});

export const rebuildDepthChartsAction: A = async () => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const teams = await sql`select id from teams where active and not exists (select 1 from team_staff s where s.team_id = teams.id)`;
  await sql.begin(async (tx) => {
    for (const t of teams) await autoDepthChart(tx, t.id, false);
    await refreshTeamRatings(tx);
  });
  await logAudit(sql, actor.userId, 'teams.depth_rebuilt', 'universe', null, { teams: teams.length });
  done();
  return `Depth charts rebuilt for ${teams.length} computer-controlled teams; all team ratings refreshed.`;
});

// ------------------------------------------------------------------ import
export const importAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireCommissionerActor();
  const sql = getSql();
  const file = fd.get('file');
  const raw = file instanceof File && file.size ? await file.text() : str(fd, 'json');
  if (!raw) throw new Error('Paste JSON or choose a file');
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('Invalid JSON'); }
  let teams = 0;
  let players = 0;
  await sql.begin(async (tx) => {
    for (const t of data.teams ?? []) {
      if (!t.school) continue;
      const slug = slugify(t.slug ?? t.school);
      const [conf] = t.conference ? await tx`select id from conferences where slug = ${t.conference} or short_name = ${t.conference}` : [null];
      await tx`insert into teams (slug, school, mascot, abbreviation, logo_url, primary_color, secondary_color, conference_id, stadium, stadium_capacity, prestige, is_custom)
               values (${slug}, ${t.school}, ${t.mascot ?? 'Team'}, ${(t.abbreviation ?? t.school.slice(0, 4)).toUpperCase()}, ${t.logoUrl ?? null},
                 ${hex(t.primaryColor ?? '', '#333333')}, ${hex(t.secondaryColor ?? '', '#ffffff')}, ${conf?.id ?? null}, ${t.stadium ?? null}, ${t.capacity ?? null},
                 ${Math.max(1, Math.min(100, Number(t.prestige) || 50))}, true)
               on conflict (slug) do update set school = excluded.school, mascot = excluded.mascot, logo_url = coalesce(excluded.logo_url, teams.logo_url),
                 primary_color = excluded.primary_color, secondary_color = excluded.secondary_color, conference_id = coalesce(excluded.conference_id, teams.conference_id)`;
      teams++;
    }
    const touched = new Set<string>();
    for (const p of data.players ?? []) {
      const [team] = await tx`select id from teams where slug = ${p.team}`;
      if (!team || !p.firstName || !p.lastName || !p.position) continue;
      const overall = Math.max(1, Math.min(99, Number(p.overall) || 60));
      await tx`insert into players (first_name, last_name, position, team_id, jersey, height_in, weight, hometown, home_state, seasons_played, stars, overall, potential, attributes)
               values (${p.firstName}, ${p.lastName}, ${p.position}, ${team.id}, ${p.jersey ?? null}, ${p.heightIn ?? null}, ${p.weight ?? null}, ${p.hometown ?? null},
                 ${p.homeState ?? null}, ${Math.max(0, Math.min(4, Number(p.seasonsPlayed) || 0))}, ${Math.max(1, Math.min(5, Number(p.stars) || 3))}, ${overall},
                 ${Math.max(overall, Math.min(99, Number(p.potential) || overall + 5))}, ${tx.json(p.attributes ?? {})})`;
      touched.add(team.id);
      players++;
    }
    for (const id of touched) await autoDepthChart(tx, id, true);
    if (touched.size) await refreshTeamRatings(tx, [...touched]);
    await logAudit(tx, actor.userId, 'data.imported', 'universe', null, { teams, players });
  });
  done();
  return `Imported ${teams} team(s) and ${players} player(s).`;
});
