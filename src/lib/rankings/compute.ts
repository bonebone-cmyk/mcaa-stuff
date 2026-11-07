/**
 * Transparent ranking algorithms.
 *
 * - Computer: a published formula of win %, strength of schedule, quality wins,
 *   bad losses, margin-based power (SRS with a preseason prior), conference
 *   titles and recent form, followed by a head-to-head correction pass.
 * - Coaches / Media polls: simulated voter panels whose ballots blend the
 *   computer resume with poll inertia (coaches) or brand & recent form (media).
 * - Playoff committee: resume-only, no inertia, heavier on quality wins & SOS.
 */
import { createRng } from '../rng';
import { computeRecords, headToHead, isOfficialFinal, strengthOfSchedule, winPct, type GameRow } from '../standings';

export interface RankTeam {
  id: string;
  conferenceId: string | null;
  prestige: number; // 1-100
  overall: number; // roster rating ~40-95
}

export interface RankingInput {
  teams: RankTeam[];
  games: GameRow[];
  conferenceChampions: Set<string>;
  previous: Map<string, number>; // teamId -> previous rank in this poll
  seed: string;
}

export interface RankingEntry {
  rank: number;
  teamId: string;
  points: number;
  firstPlaceVotes: number;
  score: number;
  record: string;
  breakdown: Record<string, number>;
}

/** Simple Rating System (margin capped at 28) blended with a roster-based prior */
export function powerRatings(teams: RankTeam[], games: GameRow[]): Map<string, number> {
  const finals = games.filter(isOfficialFinal);
  const prior = new Map(teams.map((t) => [t.id, (t.overall - 70) * 1.1]));
  const played = new Map<string, { opp: string; margin: number }[]>();
  for (const g of finals) {
    const m = Math.max(-28, Math.min(28, g.homeScore! - g.awayScore!));
    played.set(g.homeTeamId, [...(played.get(g.homeTeamId) ?? []), { opp: g.awayTeamId, margin: m }]);
    played.set(g.awayTeamId, [...(played.get(g.awayTeamId) ?? []), { opp: g.homeTeamId, margin: -m }]);
  }
  let r = new Map(prior);
  for (let it = 0; it < 30; it++) {
    const next = new Map<string, number>();
    for (const t of teams) {
      const list = played.get(t.id) ?? [];
      const srs = list.length ? list.reduce((a, x) => a + x.margin + (r.get(x.opp) ?? 0), 0) / list.length : 0;
      const w = list.length;
      next.set(t.id, (w * srs + 2 * prior.get(t.id)!) / (w + 2));
    }
    r = next;
  }
  return r;
}

export function computerRankings(input: RankingInput, limit = 25): RankingEntry[] {
  const { teams, games } = input;
  const records = computeRecords(games, teams.map((t) => t.id));
  const power = powerRatings(teams, games);
  const powerOrder = [...teams].sort((a, b) => power.get(b.id)! - power.get(a.id)!);
  const powerRank = new Map(powerOrder.map((t, i) => [t.id, i + 1]));
  const finals = games.filter(isOfficialFinal);

  const scored = teams.map((t) => {
    const rec = records.get(t.id)!;
    const gp = rec.wins + rec.losses;
    let quality = 0;
    let bad = 0;
    for (const g of finals) {
      const isHome = g.homeTeamId === t.id;
      if (!isHome && g.awayTeamId !== t.id) continue;
      const opp = isHome ? g.awayTeamId : g.homeTeamId;
      const won = isHome ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!;
      const pr = powerRank.get(opp) ?? 100;
      if (won) quality += pr <= 10 ? 1.5 : pr <= 25 ? 1 : pr <= 50 ? 0.4 : 0;
      else bad += pr > 100 ? 1.2 : pr > 70 ? 0.6 : 0;
    }
    const recentGames = finals
      .filter((g) => g.homeTeamId === t.id || g.awayTeamId === t.id)
      .sort((a, b) => b.week - a.week).slice(0, 3);
    const recent = recentGames.length
      ? recentGames.reduce((a, g) => a + Math.max(-21, Math.min(21, (g.homeTeamId === t.id ? 1 : -1) * (g.homeScore! - g.awayScore!))), 0) / recentGames.length / 21
      : 0;
    const sos = strengthOfSchedule(t.id, games, records);
    const wp = gp ? winPct(rec.wins, rec.losses) : 0.5;
    // early in the season, lean on the power prior; later, on the resume
    const resumeWeight = Math.min(1, gp / 6);
    const breakdown = {
      winPct: +(40 * wp * resumeWeight).toFixed(2),
      strengthOfSchedule: +(25 * (sos - 0.5) * resumeWeight).toFixed(2),
      qualityWins: +(3 * quality).toFixed(2),
      badLosses: +(-4 * bad).toFixed(2),
      power: +(0.6 * power.get(t.id)!).toFixed(2),
      conferenceTitle: input.conferenceChampions.has(t.id) ? 4 : 0,
      recentForm: +(2 * recent).toFixed(2),
      losses: +(-3 * rec.losses * resumeWeight).toFixed(2),
    };
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { t, score, rec, breakdown };
  });
  scored.sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id));

  // head-to-head correction: swap neighbours with near-identical scores when the lower team won the meeting
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < Math.min(scored.length - 1, limit + 5); i++) {
      const a = scored[i];
      const b = scored[i + 1];
      if (a.score - b.score > 2.5) continue;
      const h = headToHead(b.t.id, new Set([a.t.id]), games);
      if (h.w > h.l) { scored[i] = b; scored[i + 1] = a; }
    }
  }
  return scored.slice(0, limit).map((s, i) => ({
    rank: i + 1, teamId: s.t.id, points: Math.round(s.score * 10), firstPlaceVotes: 0,
    score: +s.score.toFixed(3), record: `${s.rec.wins}-${s.rec.losses}`, breakdown: s.breakdown,
  }));
}

function panelPoll(input: RankingInput, kind: 'coaches' | 'media'): RankingEntry[] {
  const all = computerRankings(input, input.teams.length);
  const byTeam = new Map(all.map((e) => [e.teamId, e]));
  const rng = createRng(`${input.seed}-${kind}`);
  const voters = kind === 'coaches' ? 62 : 60;
  const points = new Map<string, number>();
  const firsts = new Map<string, number>();
  const prestige = new Map(input.teams.map((t) => [t.id, t.prestige]));
  const records = computeRecords(input.games, input.teams.map((t) => t.id));
  for (let v = 0; v < voters; v++) {
    const bias = rng.normal(0, 1);
    const ballot = all.slice(0, 45).map((e) => {
      const prev = input.previous.get(e.teamId);
      const inertia = prev ? (26 - prev) * (kind === 'coaches' ? 0.35 : 0.18) : 0;
      const brand = ((prestige.get(e.teamId) ?? 50) - 50) * (kind === 'media' ? 0.06 : 0.03) * (1 + 0.3 * bias);
      const rec = records.get(e.teamId)!;
      const lossPenalty = rec.losses * (kind === 'coaches' ? 2.2 : 1.6);
      const noise = rng.normal(0, kind === 'media' ? 2.4 : 1.8);
      return { teamId: e.teamId, s: e.score + inertia + brand - lossPenalty + noise };
    }).sort((a, b) => b.s - a.s).slice(0, 25);
    ballot.forEach((b, i) => {
      points.set(b.teamId, (points.get(b.teamId) ?? 0) + (25 - i));
      if (i === 0) firsts.set(b.teamId, (firsts.get(b.teamId) ?? 0) + 1);
    });
  }
  return [...points.entries()]
    .sort((a, b) => b[1] - a[1] || (firsts.get(b[0]) ?? 0) - (firsts.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([teamId, pts], i) => ({
      rank: i + 1, teamId, points: pts, firstPlaceVotes: firsts.get(teamId) ?? 0,
      score: byTeam.get(teamId)!.score, record: byTeam.get(teamId)!.record,
      breakdown: { voters, ...byTeam.get(teamId)!.breakdown },
    }));
}

export function coachesPoll(input: RankingInput) { return panelPoll(input, 'coaches'); }
export function mediaPoll(input: RankingInput) { return panelPoll(input, 'media'); }

export function playoffRankings(input: RankingInput): RankingEntry[] {
  const all = computerRankings(input, input.teams.length);
  const rescored = all.map((e) => {
    const b = e.breakdown;
    const s = b.winPct + b.strengthOfSchedule * 1.4 + b.qualityWins * 1.5 + b.badLosses * 1.3 + b.power * 0.5 + b.conferenceTitle * 1.5 + b.losses;
    return { ...e, score: +s.toFixed(3) };
  }).sort((a, b) => b.score - a.score);
  return rescored.slice(0, 25).map((e, i) => ({ ...e, rank: i + 1, points: Math.round(e.score * 10) }));
}

export function computePoll(poll: 'coaches' | 'media' | 'computer' | 'playoff', input: RankingInput): RankingEntry[] {
  switch (poll) {
    case 'coaches': return coachesPoll(input);
    case 'media': return mediaPoll(input);
    case 'playoff': return playoffRankings(input);
    default: return computerRankings(input);
  }
}
