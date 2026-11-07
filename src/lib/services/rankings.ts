import type { Tx } from '../db';
import { insertMany } from '../db';
import { computePoll, type RankingEntry } from '../rankings/compute';
import type { GameRow } from '../standings';
import { logAudit } from './audit';

export type PollName = 'coaches' | 'media' | 'computer' | 'playoff';

export async function loadSeasonGames(sql: Tx, seasonId: string, throughWeek?: number): Promise<GameRow[]> {
  const rows = await sql`
    select id, week, home_team_id, away_team_id, home_score, away_score, status, is_conference_game, game_type, neutral_site
    from games where season_id = ${seasonId} ${throughWeek !== undefined ? sql`and week <= ${throughWeek}` : sql``}`;
  return rows.map((r) => ({ ...r })) as unknown as GameRow[];
}

/** Computes and stores the requested polls for (season, week). Manual polls for that week are left untouched. */
export async function generateRankings(sql: Tx, seasonId: string, week: number, polls: PollName[], actorId: string | null) {
  const teams = await sql`select id, conference_id, prestige, overall_rating as overall from teams where active`;
  const games = await loadSeasonGames(sql, seasonId, week);
  const champs = await sql`select team_id from championships where season_id = ${seasonId} and kind = 'conference'`;
  const out: Record<string, RankingEntry[]> = {};
  for (const poll of polls) {
    const manual = await sql`select 1 from rankings where season_id = ${seasonId} and week = ${week} and poll = ${poll} and is_manual limit 1`;
    if (manual.length) continue;
    const prevRows = await sql`
      select team_id, rank from rankings where season_id = ${seasonId} and poll = ${poll}
      and week = (select max(week) from rankings where season_id = ${seasonId} and poll = ${poll} and week < ${week})`;
    const previous = new Map(prevRows.map((r) => [r.teamId as string, r.rank as number]));
    const entries = computePoll(poll, {
      teams: teams.map((t) => ({ id: t.id, conferenceId: t.conferenceId, prestige: t.prestige, overall: t.overall })),
      games, conferenceChampions: new Set(champs.map((c) => c.teamId as string)), previous, seed: `${seasonId}-${week}-${poll}`,
    });
    await sql`delete from rankings where season_id = ${seasonId} and week = ${week} and poll = ${poll}`;
    await insertMany(sql, 'rankings', entries.map((e) => ({
      seasonId, week, poll, rank: e.rank, teamId: e.teamId, points: e.points, firstPlaceVotes: e.firstPlaceVotes,
      previousRank: previous.get(e.teamId) ?? null, record: e.record, score: e.score, breakdown: sql.json(e.breakdown), isManual: false,
    })));
    out[poll] = entries;
  }
  if (actorId) await logAudit(sql, actorId, 'rankings.generated', 'season', seasonId, { week, polls });
  return out;
}

/** Commissioner-managed poll: an ordered list of up to 25 team ids */
export async function setManualRanking(sql: Tx, seasonId: string, week: number, poll: PollName, teamIds: string[], actorId: string) {
  const unique = [...new Set(teamIds)].slice(0, 25);
  const prevRows = await sql`
    select team_id, rank from rankings where season_id = ${seasonId} and poll = ${poll}
    and week = (select max(week) from rankings where season_id = ${seasonId} and poll = ${poll} and week < ${week})`;
  const previous = new Map(prevRows.map((r) => [r.teamId as string, r.rank as number]));
  const records = await sql`select team_id, wins, losses from team_records where season_id = ${seasonId}`;
  const rec = new Map(records.map((r) => [r.teamId as string, `${r.wins}-${r.losses}`]));
  await sql`delete from rankings where season_id = ${seasonId} and week = ${week} and poll = ${poll}`;
  await insertMany(sql, 'rankings', unique.map((teamId, i) => ({
    seasonId, week, poll, rank: i + 1, teamId, points: (25 - i) * 10, firstPlaceVotes: 0, previousRank: previous.get(teamId) ?? null,
    record: rec.get(teamId) ?? '0-0', score: null, breakdown: null, isManual: true,
  })));
  await logAudit(sql, actorId, 'rankings.manual_set', 'season', seasonId, { week, poll, teams: unique.length });
}
