import 'server-only';
import { cache } from 'react';
import { getSql } from '../db';
import { computeRecords, sortStandings, strengthOfSchedule, type GameRow } from '../standings';

export interface TeamRow {
  id: string;
  slug: string;
  school: string;
  mascot: string;
  abbreviation: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  conferenceId: string | null;
  conferenceSlug: string | null;
  conferenceName: string | null;
  prestige: number;
  overallRating: number;
  offenseRating: number;
  defenseRating: number;
}

export const getTeams = cache(async (): Promise<TeamRow[]> => {
  const sql = getSql();
  return (await sql`
    select t.id, t.slug, t.school, t.mascot, t.abbreviation, t.logo_url, t.primary_color, t.secondary_color, t.conference_id,
      c.slug as conference_slug, c.short_name as conference_name, t.prestige, t.overall_rating, t.offense_rating, t.defense_rating
    from teams t left join conferences c on c.id = t.conference_id
    where t.active order by t.school`) as unknown as TeamRow[];
});

export const getTeamMap = cache(async () => new Map((await getTeams()).map((t) => [t.id, t])));

export const getConferences = cache(async () => {
  const sql = getSql();
  return sql`select c.*, (select count(*)::int from teams t where t.conference_id = c.id and t.active) as team_count
             from conferences c order by (c.slug = 'independent'), c.name`;
});

export const getSettingsRow = cache(async () => {
  const sql = getSql();
  const [s] = await sql`select * from universe_settings where id = 1`;
  return s;
});

export const getCurrentSeason = cache(async () => {
  const sql = getSql();
  const s = await getSettingsRow();
  if (s?.currentSeasonId) {
    const [season] = await sql`select * from seasons where id = ${s.currentSeasonId}`;
    if (season) return season;
  }
  const [latest] = await sql`select * from seasons order by year desc, created_at desc limit 1`;
  return latest ?? null;
});

export const getSeasons = cache(async () => getSql()`select * from seasons order by year desc, created_at desc`);

export async function resolveSeason(seasonParam?: string) {
  if (seasonParam) {
    const [s] = await getSql()`select * from seasons where id = ${seasonParam}`;
    if (s) return s;
  }
  return getCurrentSeason();
}

export interface GameView {
  id: string;
  seasonId: string;
  week: number;
  status: 'scheduled' | 'final';
  gameType: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  overtimes: number;
  kickoffAt: Date | null;
  neutralSite: boolean;
  siteName: string | null;
  isGameOfWeek: boolean;
  isConferenceGame: boolean;
  isRivalry: boolean;
  rivalryName: string | null;
  networkName: string | null;
  networkShort: string | null;
  playoffRound: number | null;
  simMode: string | null;
  isDemo: boolean;
  summary: any;
}

export async function getGames(where: { seasonId: string; week?: number; teamId?: string; status?: 'final' | 'scheduled'; limit?: number; order?: 'asc' | 'desc' }) {
  const sql = getSql();
  return (await sql`
    select g.id, g.season_id, g.week, g.status, g.game_type, g.home_team_id, g.away_team_id, g.home_score, g.away_score, g.overtimes,
      g.kickoff_at, g.neutral_site, g.site_name, g.is_game_of_week, g.is_conference_game, g.is_rivalry, r.name as rivalry_name,
      n.name as network_name, n.short_name as network_short, g.playoff_round, g.sim_mode, g.is_demo, g.summary
    from games g
    left join tv_networks n on n.id = g.tv_network_id
    left join rivalries r on r.id = g.rivalry_id
    where g.season_id = ${where.seasonId}
      ${where.week !== undefined ? sql`and g.week = ${where.week}` : sql``}
      ${where.teamId ? sql`and (g.home_team_id = ${where.teamId} or g.away_team_id = ${where.teamId})` : sql``}
      ${where.status ? sql`and g.status = ${where.status}` : sql``}
    order by g.week ${where.order === 'desc' ? sql`desc` : sql`asc`}, g.is_game_of_week desc, g.kickoff_at nulls last, g.id
    ${where.limit ? sql`limit ${where.limit}` : sql``}`) as unknown as GameView[];
}

export async function getLatestPoll(seasonId: string, poll: string, week?: number) {
  const sql = getSql();
  const [w] = week !== undefined
    ? [{ week }]
    : await sql`select max(week) as week from rankings where season_id = ${seasonId} and poll = ${poll}`;
  if (w?.week === null || w?.week === undefined) return { week: null as number | null, rows: [] as any[] };
  const rows = await sql`select * from rankings where season_id = ${seasonId} and poll = ${poll} and week = ${w.week} order by rank`;
  return { week: w.week as number, rows };
}

/** team id → current AP-style (media) rank, for "No. 5 Texas" labels */
export const getRankMap = cache(async (seasonId: string) => {
  const { rows } = await getLatestPoll(seasonId, 'media');
  return new Map(rows.map((r) => [r.teamId as string, r.rank as number]));
});

export async function loadGameRows(seasonId: string): Promise<GameRow[]> {
  const sql = getSql();
  return (await sql`select id, week, home_team_id, away_team_id, home_score, away_score, status, is_conference_game, game_type, neutral_site
                    from games where season_id = ${seasonId}`) as unknown as GameRow[];
}

export async function getConferenceStandings(seasonId: string, conferenceId: string) {
  const sql = getSql();
  const members = await sql`select team_id from team_seasons where season_id = ${seasonId} and conference_id = ${conferenceId}`;
  const games = await loadGameRows(seasonId);
  const ids = members.map((m) => m.teamId as string);
  const records = computeRecords(games, ids);
  const order = sortStandings(ids, records, games);
  return order.map((id) => ({ teamId: id, record: records.get(id)!, sos: strengthOfSchedule(id, games, records) }));
}

export async function getTeamRecords(seasonId: string) {
  const sql = getSql();
  const rows = await sql`select * from team_records where season_id = ${seasonId}`;
  return new Map(rows.map((r) => [r.teamId as string, r]));
}

export function recordStr(r: { wins?: number; losses?: number } | undefined | null) {
  return r ? `${r.wins ?? 0}-${r.losses ?? 0}` : '0-0';
}

export function weekLabel(season: any, week: number) {
  if (week === 0) return 'Preseason';
  if (week <= season.regularSeasonWeeks) return `Week ${week}`;
  if (week === season.regularSeasonWeeks + 1) return 'Championship Week';
  return `Playoffs · Round ${week - season.regularSeasonWeeks - 1}`;
}

export const PHASE_LABEL: Record<string, string> = {
  preseason: 'Preseason', regular: 'Regular Season', conference_championships: 'Championship Week',
  playoffs: 'College Football Playoff', offseason: 'Offseason', archived: 'Archived',
};

/** Recruiting class rankings for a season (high-school signees + commits) */
export async function getClassRankings(seasonId: string) {
  const { classScore } = await import('../recruiting/engine');
  const rows = await getSql()`select coalesce(signed_team_id, committed_team_id) as team_id, stars, overall from recruits
    where season_id = ${seasonId} and not is_transfer and status in ('committed', 'signed')`;
  const by = new Map<string, { stars: number; overall: number }[]>();
  for (const r of rows) by.set(r.teamId, [...(by.get(r.teamId) ?? []), { stars: r.stars, overall: r.overall }]);
  return [...by.entries()]
    .map(([teamId, cs]) => ({
      teamId, score: classScore(cs), commits: cs.length, fiveStars: cs.filter((c) => c.stars === 5).length,
      fourStars: cs.filter((c) => c.stars === 4).length, avgStars: cs.reduce((a, c) => a + c.stars, 0) / cs.length,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
