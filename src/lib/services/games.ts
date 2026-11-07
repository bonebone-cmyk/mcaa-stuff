import type { Sql, Tx } from '../db';
import { insertMany } from '../db';
import { simulateGame } from '../sim/engine';
import type { GameResult, SimSettings, SimTeam, TeamStatLine } from '../sim/types';
import { bestSeedOf, buildBracket, bracketRounds, resolveMatchup, roundName } from '../playoffs';
import { loadDepthRoster } from './teams';
import { logAudit } from './audit';
import { getSettings } from './settings';

export type SimModeName = 'quick' | 'detailed' | 'live';

export class GameStateError extends Error {
  constructor(msg: string) { super(msg); this.name = 'GameStateError'; }
}

export async function buildSimTeam(sql: Tx, teamId: string, seasonId: string | null, beforeWeek?: number): Promise<SimTeam> {
  const [t] = await sql`select id, school, abbreviation, coach_rating, home_field_rating, offense_scheme, defense_scheme from teams where id = ${teamId}`;
  if (!t) throw new GameStateError('Team not found');
  let momentum = 0;
  if (seasonId) {
    const recent = await sql`
      select won, points_for - points_against as margin from team_game_results
      where season_id = ${seasonId} and team_id = ${teamId} ${beforeWeek !== undefined ? sql`and week < ${beforeWeek}` : sql``}
      order by week desc limit 3`;
    if (recent.length) momentum = recent.reduce((a, r) => a + (r.won ? 1 : -1) * (0.6 + Math.min(Math.abs(r.margin), 21) / 52), 0) / 3;
  }
  return {
    id: t.id, name: t.school, abbr: t.abbreviation, coachRating: t.coachRating, homeFieldRating: t.homeFieldRating,
    offenseScheme: t.offenseScheme, defenseScheme: t.defenseScheme, momentum,
    roster: await loadDepthRoster(sql, teamId),
  };
}

function teamStatRow(gameId: string, s: TeamStatLine) {
  return {
    gameId, teamId: s.teamId, points: s.points, firstDowns: s.firstDowns, totalYards: s.totalYards, passYards: s.passYards,
    rushYards: s.rushYards, passAtt: s.passAtt, passCmp: s.passCmp, rushAtt: s.rushAtt, turnovers: s.turnovers,
    penalties: s.penalties, penaltyYards: s.penaltyYards, thirdDownConv: s.thirdDownConv, thirdDownAtt: s.thirdDownAtt,
    sacks: s.sacks, timeOfPossession: s.timeOfPossession,
  };
}

export interface FinalizeArgs {
  gameId: string;
  result: GameResult;
  mode: SimModeName | 'manual';
  settings: SimSettings | null;
  actorId: string | null;
  expectedVersion?: number;
  notes?: string | null;
}

/**
 * Writes an official result in ONE transaction. The game row is locked
 * (SELECT … FOR UPDATE) and must not already be final, so the same game can
 * never be finalized twice even if two commissioners click at once.
 */
export async function finalizeGame(sql: Sql, args: FinalizeArgs) {
  const { gameId, result, mode } = args;
  return sql.begin(async (tx) => {
    const [g] = await tx`select * from games where id = ${gameId} for update`;
    if (!g) throw new GameStateError('Game not found');
    if (g.status === 'final') throw new GameStateError('This game is already final. Use "Override result" to change it.');
    if (args.expectedVersion !== undefined && g.version !== args.expectedVersion) throw new GameStateError('This game changed since you opened it. Reload and try again.');
    if (result.homeTeamId !== g.homeTeamId || result.awayTeamId !== g.awayTeamId) throw new GameStateError('Result does not match the scheduled teams');
    if (result.homeScore === result.awayScore) throw new GameStateError('College games cannot end in a tie');

    await insertMany(tx, 'team_game_stats', [teamStatRow(gameId, result.teamStats.home), teamStatRow(gameId, result.teamStats.away)]);
    await insertMany(tx, 'player_game_stats', result.playerStats.map((p) => ({
      gameId, playerId: p.playerId, teamId: p.teamId, passAtt: p.passAtt, passCmp: p.passCmp, passYds: p.passYds, passTd: p.passTd,
      passInt: p.passInt, rushAtt: p.rushAtt, rushYds: p.rushYds, rushTd: p.rushTd, rec: p.rec, recYds: p.recYds, recTd: p.recTd,
      tackles: p.tackles, sacks: p.sacks, tfl: p.tfl, defInt: p.defInt, forcedFumbles: p.forcedFumbles, fgm: p.fgm, fga: p.fga,
      xpm: p.xpm, xpa: p.xpa, punts: p.punts, puntYds: p.puntYds, kr: p.kr, krYds: p.krYds, pr: p.pr, prYds: p.prYds,
    })));
    if (mode === 'detailed' || mode === 'live') {
      await insertMany(tx, 'game_drives', result.drives.map((d) => ({
        gameId, driveNo: d.driveNo, teamId: d.teamId, quarter: d.quarter, startClock: d.startClock, startYard: d.startYard,
        plays: d.plays, yards: d.yards, durationSeconds: d.durationSeconds, result: d.result, points: d.points,
      })));
      await insertMany(tx, 'game_plays', result.plays.map((p) => ({
        gameId, seq: p.seq, driveNo: p.driveNo, quarter: p.quarter, clock: p.clock, offenseTeamId: p.offenseTeamId,
        down: p.down, distance: p.distance, yardLine: p.yardLine, playType: p.playType, yards: p.yards,
        description: p.description, homeScore: p.homeScore, awayScore: p.awayScore, isScoring: p.isScoring,
        isTurnover: p.isTurnover, homeWinProb: p.homeWinProb, statDeltas: p.statDeltas?.length ? tx.json(p.statDeltas as any) : null,
      })), 1000);
    }
    const summary = {
      tags: result.tags,
      injuries: result.injuries,
      pregameHomeWinProb: result.pregameHomeWinProb,
      maxComeback: result.maxComeback,
      scoring: result.plays.filter((p) => p.isScoring).map((p) => ({ q: p.quarter, clock: p.clock, team: p.offenseTeamId, text: p.description, home: p.homeScore, away: p.awayScore })),
    };
    const [updated] = await tx`
      update games set status = 'final', home_score = ${result.homeScore}, away_score = ${result.awayScore},
        home_quarters = ${result.teamStats.home.quarters}, away_quarters = ${result.teamStats.away.quarters},
        overtimes = ${result.overtimes}, winner_team_id = ${result.winnerTeamId}, sim_mode = ${mode},
        sim_seed = ${result.seed || null}, sim_settings = ${args.settings ? tx.json(args.settings as any) : null},
        summary = ${tx.json(summary as any)}, finalized_at = now(), finalized_by = ${args.actorId},
        notes = coalesce(${args.notes ?? null}, notes), version = version + 1
      where id = ${gameId} returning *`;

    // In-game injuries carry over to rosters for official games only
    if (g.gameType !== 'exhibition') {
      for (const inj of result.injuries) {
        await tx`update players set injury_type = ${inj.type}, injury_weeks = greatest(injury_weeks, ${inj.weeks}) where id = ${inj.playerId}`;
      }
    }
    await postFinalHooks(tx, updated);
    await logAudit(tx, args.actorId, mode === 'manual' ? 'game.manual_result' : 'game.simulated', 'game', gameId, {
      mode, seed: result.seed, score: `${result.homeScore}-${result.awayScore}`, overtimes: result.overtimes,
    });
    return updated;
  });
}

async function postFinalHooks(tx: Tx, g: any) {
  const [season] = await tx`select * from seasons where id = ${g.seasonId}`;
  if (g.gameType === 'conference_championship' && g.conferenceId) {
    await tx`insert into championships (season_id, kind, conference_id, team_id, game_id)
             values (${g.seasonId}, 'conference', ${g.conferenceId}, ${g.winnerTeamId}, ${g.id})
             on conflict do nothing`;
    await tx`update team_seasons set conference_champion = true where season_id = ${g.seasonId} and team_id = ${g.winnerTeamId}`;
    const [conf] = await tx`select short_name from conferences where id = ${g.conferenceId}`;
    await tx`insert into team_timeline_events (team_id, year, title, description, kind, game_id)
             values (${g.winnerTeamId}, ${season.year}, ${`${conf?.shortName ?? 'Conference'} Champions`}, ${`Won the ${season.year} ${conf?.shortName ?? ''} Championship Game ${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}.`}, 'official', ${g.id})`;
  }
  if (g.gameType === 'playoff') await advanceBracket(tx, g.seasonId);
}

/** Creates any playoff games whose two participants are now known; crowns the champion after the final */
export async function advanceBracket(tx: Tx, seasonId: string) {
  const [bracket] = await tx`select * from playoff_brackets where season_id = ${seasonId}`;
  if (!bracket) return;
  const [season] = await tx`select * from seasons where id = ${seasonId}`;
  const seedRows = await tx`select seed, team_id from playoff_seeds where bracket_id = ${bracket.id}`;
  const seeds = new Map<number, string>(seedRows.map((s) => [s.seed as number, s.teamId as string]));
  const games = await tx`select * from games where season_id = ${seasonId} and game_type = 'playoff'`;
  const winners = new Map<string, string>();
  for (const g of games) if (g.status === 'final') winners.set(`${g.playoffRound}-${g.bracketSlot}`, g.winnerTeamId);
  const matchups = buildBracket(bracket.size);
  const rounds = bracketRounds(bracket.size);
  const bowls = ['Crescent City Bowl', 'Sunland Classic', 'Desert Sky Bowl', 'Pinnacle Bowl', 'Harbor Lights Bowl', 'Prairie Fire Bowl', 'Evergreen Bowl', 'Magnolia Bowl'];
  for (const m of matchups) {
    const exists = games.find((g) => g.playoffRound === m.round && g.bracketSlot === m.slot);
    if (exists) continue;
    const [a, b] = resolveMatchup(m, seeds, winners);
    if (!a || !b) continue;
    const seedA = bestSeedOf(m.sources[0], matchups);
    const seedB = bestSeedOf(m.sources[1], matchups);
    const [home, away] = seedA <= seedB ? [a, b] : [b, a];
    const campus = m.round === 1 && rounds >= 3;
    const name = roundName(bracket.size, m.round);
    const site = campus ? null : m.round === rounds ? 'CFU National Championship' : `${bowls[(m.round * 3 + m.slot) % bowls.length]} — ${name}`;
    await tx`insert into games (season_id, week, home_team_id, away_team_id, game_type, playoff_round, bracket_slot, neutral_site, site_name, is_demo, is_game_of_week)
             values (${seasonId}, ${season.regularSeasonWeeks + 1 + m.round}, ${home}, ${away}, 'playoff', ${m.round}, ${m.slot}, ${!campus}, ${site}, ${season.isDemo}, ${m.round === rounds})`;
  }
  const final = games.find((g) => g.playoffRound === rounds && g.status === 'final');
  if (final && !season.championTeamId) {
    await tx`update seasons set champion_team_id = ${final.winnerTeamId} where id = ${seasonId}`;
    await tx`insert into championships (season_id, kind, team_id, game_id) values (${seasonId}, 'national', ${final.winnerTeamId}, ${final.id}) on conflict do nothing`;
    await tx`update team_seasons set national_champion = true where season_id = ${seasonId} and team_id = ${final.winnerTeamId}`;
    await tx`insert into team_timeline_events (team_id, year, title, description, kind, game_id)
             values (${final.winnerTeamId}, ${season.year}, 'National Champions', ${`Won the ${season.year} CFU National Championship ${Math.max(final.homeScore, final.awayScore)}-${Math.min(final.homeScore, final.awayScore)}.`}, 'official', ${final.id})`;
  }
}

export function seedFor(gameId: string, version: number, override?: string | null) {
  return override?.trim() ? override.trim() : `${gameId}:v${version}`;
}

/** Server-side simulation of a scheduled game, saved as an official result */
export async function simulateScheduledGame(sql: Sql, gameId: string, mode: SimModeName, actorId: string | null, seedOverride?: string | null) {
  const [g] = await sql`select * from games where id = ${gameId}`;
  if (!g) throw new GameStateError('Game not found');
  if (g.status === 'final') throw new GameStateError('This game is already final.');
  const settings = (await getSettings(sql)).simSettings;
  // momentum only from earlier weeks, so re-simulating a reopened game with the same seed reproduces it
  const [home, away] = await Promise.all([buildSimTeam(sql, g.homeTeamId, g.seasonId, g.week), buildSimTeam(sql, g.awayTeamId, g.seasonId, g.week)]);
  const seed = seedFor(g.id, g.version, seedOverride);
  const result = simulateGame({ home, away, neutralSite: g.neutralSite, settings, seed });
  return finalizeGame(sql, { gameId, result, mode, settings, actorId, expectedVersion: g.version });
}

export interface ManualResultInput {
  homeScore: number;
  awayScore: number;
  homeQuarters?: number[];
  awayQuarters?: number[];
  overtimes?: number;
  notes?: string | null;
  stats?: { home?: Partial<TeamStatLine>; away?: Partial<TeamStatLine> };
}

/** Records a result from a game played outside the engine (e.g. in EA Sports College Football) */
export async function enterManualResult(sql: Sql, gameId: string, input: ManualResultInput, actorId: string) {
  const [g] = await sql`select * from games where id = ${gameId}`;
  if (!g) throw new GameStateError('Game not found');
  const qh = input.homeQuarters?.length ? input.homeQuarters : [input.homeScore, 0, 0, 0];
  const qa = input.awayQuarters?.length ? input.awayQuarters : [input.awayScore, 0, 0, 0];
  if (qh.reduce((a, b) => a + b, 0) !== input.homeScore || qa.reduce((a, b) => a + b, 0) !== input.awayScore) {
    throw new GameStateError('Quarter scores must add up to the final score');
  }
  const base = (teamId: string, points: number, quarters: number[], extra?: Partial<TeamStatLine>): TeamStatLine => ({
    teamId, points, firstDowns: 0, totalYards: 0, passYards: 0, rushYards: 0, passAtt: 0, passCmp: 0, rushAtt: 0, turnovers: 0,
    penalties: 0, penaltyYards: 0, thirdDownConv: 0, thirdDownAtt: 0, sacks: 0, timeOfPossession: 0, ...extra, quarters,
  });
  const home = base(g.homeTeamId, input.homeScore, qh, input.stats?.home);
  const away = base(g.awayTeamId, input.awayScore, qa, input.stats?.away);
  home.totalYards = home.passYards + home.rushYards;
  away.totalYards = away.passYards + away.rushYards;
  const result: GameResult = {
    seed: '', homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, homeScore: input.homeScore, awayScore: input.awayScore,
    overtimes: input.overtimes ?? Math.max(0, qh.length - 4), winnerTeamId: input.homeScore > input.awayScore ? g.homeTeamId : g.awayTeamId,
    plays: [], drives: [], teamStats: { home, away }, playerStats: [], injuries: [], pregameHomeWinProb: 0.5, tags: ['manual'], maxComeback: 0,
  };
  return finalizeGame(sql, { gameId, result, mode: 'manual', settings: null, actorId, notes: input.notes ?? null });
}

/** Commissioner override: re-opens a final game (removes its stats) so it can be re-simulated or re-entered */
export async function reopenGame(sql: Sql, gameId: string, actorId: string, reason: string) {
  return sql.begin(async (tx) => {
    const [g] = await tx`select * from games where id = ${gameId} for update`;
    if (!g) throw new GameStateError('Game not found');
    if (g.status !== 'final') throw new GameStateError('Game is not final');
    if (g.gameType === 'playoff') {
      const later = await tx`select id, status from games where season_id = ${g.seasonId} and game_type = 'playoff' and playoff_round > ${g.playoffRound}`;
      if (later.some((x) => x.status === 'final')) throw new GameStateError('A later playoff round has already been played; reopen that game first.');
      for (const x of later) await tx`delete from games where id = ${x.id}`;
      await tx`update seasons set champion_team_id = null where id = ${g.seasonId} and champion_team_id = ${g.winnerTeamId}`;
      await tx`delete from championships where game_id = ${g.id}`;
      await tx`update team_seasons set national_champion = false where season_id = ${g.seasonId}`;
    }
    if (g.gameType === 'conference_championship') {
      await tx`delete from championships where game_id = ${g.id}`;
      await tx`update team_seasons set conference_champion = false where season_id = ${g.seasonId} and team_id = ${g.winnerTeamId}`;
    }
    await tx`delete from team_timeline_events where game_id = ${g.id} and kind = 'official'`;
    // undo injuries this result caused (official games only)
    if (g.gameType !== 'exhibition') {
      for (const inj of (g.summary?.injuries ?? []) as { playerId: string; type: string }[]) {
        await tx`update players set injury_weeks = 0, injury_type = null where id = ${inj.playerId} and injury_type = ${inj.type}`;
      }
    }
    await tx`delete from player_game_stats where game_id = ${gameId}`;
    await tx`delete from team_game_stats where game_id = ${gameId}`;
    await tx`delete from game_plays where game_id = ${gameId}`;
    await tx`delete from game_drives where game_id = ${gameId}`;
    await tx`update games set status = 'scheduled', home_score = null, away_score = null, home_quarters = null, away_quarters = null,
             overtimes = 0, winner_team_id = null, summary = null, finalized_at = null, finalized_by = null, version = version + 1
             where id = ${gameId}`;
    await logAudit(tx, actorId, 'game.reopened', 'game', gameId, { previous: `${g.homeScore}-${g.awayScore}`, reason });
  });
}

/** Exhibition sandbox: pick any two teams; result is saved but never counts in standings or stats */
export async function createExhibition(sql: Sql, homeId: string, awayId: string, neutral: boolean, actorId: string) {
  if (homeId === awayId) throw new GameStateError('Pick two different teams');
  const settings = await getSettings(sql);
  if (!settings.currentSeasonId) throw new GameStateError('Create a season first');
  const [season] = await sql`select * from seasons where id = ${settings.currentSeasonId}`;
  const [g] = await sql`insert into games (season_id, week, home_team_id, away_team_id, game_type, neutral_site, is_demo)
                        values (${season.id}, ${season.currentWeek}, ${homeId}, ${awayId}, 'exhibition', ${neutral}, ${season.isDemo}) returning id`;
  await logAudit(sql, actorId, 'game.exhibition_created', 'game', g.id, { homeId, awayId });
  return g.id as string;
}
