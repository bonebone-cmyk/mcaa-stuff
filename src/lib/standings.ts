/**
 * Records, standings, strength of schedule and head-to-head tiebreakers,
 * computed purely from official final games.
 */
export interface GameRow {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'final';
  isConferenceGame: boolean;
  gameType: string;
  neutralSite: boolean;
}

export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  neutralWins: number;
  neutralLosses: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string; // e.g. "W3"
  last: ('W' | 'L')[]; // chronological results
}

export const winPct = (w: number, l: number) => (w + l === 0 ? 0 : w / (w + l));

export function isOfficialFinal(g: GameRow) {
  return g.status === 'final' && g.gameType !== 'exhibition' && g.homeScore !== null && g.awayScore !== null;
}

export function emptyRecord(teamId: string): TeamRecord {
  return {
    teamId, wins: 0, losses: 0, confWins: 0, confLosses: 0, homeWins: 0, homeLosses: 0, awayWins: 0,
    awayLosses: 0, neutralWins: 0, neutralLosses: 0, pointsFor: 0, pointsAgainst: 0, streak: '-', last: [],
  };
}

export function computeRecords(games: GameRow[], teamIds: Iterable<string> = []): Map<string, TeamRecord> {
  const map = new Map<string, TeamRecord>();
  for (const id of teamIds) map.set(id, emptyRecord(id));
  const get = (id: string) => {
    let r = map.get(id);
    if (!r) { r = emptyRecord(id); map.set(id, r); }
    return r;
  };
  const finals = games.filter(isOfficialFinal).sort((a, b) => a.week - b.week);
  for (const g of finals) {
    const home = get(g.homeTeamId);
    const away = get(g.awayTeamId);
    const homeWon = g.homeScore! > g.awayScore!;
    home.pointsFor += g.homeScore!; home.pointsAgainst += g.awayScore!;
    away.pointsFor += g.awayScore!; away.pointsAgainst += g.homeScore!;
    const apply = (r: TeamRecord, won: boolean, venue: 'home' | 'away' | 'neutral') => {
      if (won) r.wins++; else r.losses++;
      if (g.isConferenceGame && g.gameType === 'regular') { if (won) r.confWins++; else r.confLosses++; }
      if (venue === 'home') { if (won) r.homeWins++; else r.homeLosses++; }
      else if (venue === 'away') { if (won) r.awayWins++; else r.awayLosses++; }
      else if (won) r.neutralWins++; else r.neutralLosses++;
      r.last.push(won ? 'W' : 'L');
    };
    apply(home, homeWon, g.neutralSite ? 'neutral' : 'home');
    apply(away, !homeWon, g.neutralSite ? 'neutral' : 'away');
  }
  for (const r of map.values()) {
    if (!r.last.length) continue;
    const lastRes = r.last[r.last.length - 1];
    let n = 0;
    for (let i = r.last.length - 1; i >= 0 && r.last[i] === lastRes; i--) n++;
    r.streak = `${lastRes}${n}`;
  }
  return map;
}

/** Head-to-head wins of `teamId` against the set `opponents` */
export function headToHead(teamId: string, opponents: Set<string>, games: GameRow[]) {
  let w = 0;
  let l = 0;
  for (const g of games) {
    if (!isOfficialFinal(g)) continue;
    const isHome = g.homeTeamId === teamId;
    const isAway = g.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const opp = isHome ? g.awayTeamId : g.homeTeamId;
    if (!opponents.has(opp)) continue;
    const won = isHome ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!;
    if (won) w++; else l++;
  }
  return { w, l };
}

/**
 * Conference standings order:
 *  1. conference win %  2. head-to-head among tied teams  3. overall win %
 *  4. point differential  5. points scored  6. team id (stable)
 */
export function sortStandings(teamIds: string[], records: Map<string, TeamRecord>, games: GameRow[]): string[] {
  const rec = (id: string) => records.get(id) ?? emptyRecord(id);
  const primary = (id: string) => winPct(rec(id).confWins, rec(id).confLosses);
  const groups = new Map<number, string[]>();
  for (const id of teamIds) {
    const k = Math.round(primary(id) * 10000);
    groups.set(k, [...(groups.get(k) ?? []), id]);
  }
  const ordered: string[] = [];
  for (const k of [...groups.keys()].sort((a, b) => b - a)) {
    const tied = groups.get(k)!;
    if (tied.length === 1) { ordered.push(tied[0]); continue; }
    const set = new Set(tied);
    const h2h = new Map(tied.map((id) => {
      const others = new Set([...set].filter((x) => x !== id));
      const { w, l } = headToHead(id, others, games);
      return [id, w + l === 0 ? 0.5 : w / (w + l)];
    }));
    tied.sort((a, b) =>
      h2h.get(b)! - h2h.get(a)! ||
      winPct(rec(b).wins, rec(b).losses) - winPct(rec(a).wins, rec(a).losses) ||
      (rec(b).pointsFor - rec(b).pointsAgainst) - (rec(a).pointsFor - rec(a).pointsAgainst) ||
      rec(b).pointsFor - rec(a).pointsFor ||
      a.localeCompare(b),
    );
    ordered.push(...tied);
  }
  return ordered;
}

/** Opponents' win % (2/3) + opponents' opponents' win % (1/3), on 0-1 scale */
export function strengthOfSchedule(teamId: string, games: GameRow[], records: Map<string, TeamRecord>): number {
  const opponentsOf = (id: string) =>
    games.filter((g) => isOfficialFinal(g) && (g.homeTeamId === id || g.awayTeamId === id))
      .map((g) => (g.homeTeamId === id ? g.awayTeamId : g.homeTeamId));
  const opps = opponentsOf(teamId);
  if (!opps.length) return 0.5;
  const pct = (id: string, exclude: string) => {
    // exclude games against the team being evaluated (NCAA-style)
    const r = records.get(id);
    if (!r) return 0.5;
    const vs = headToHead(id, new Set([exclude]), games);
    return winPct(r.wins - vs.w, r.losses - vs.l);
  };
  const ow = opps.reduce((a, o) => a + pct(o, teamId), 0) / opps.length;
  const oow = opps.reduce((a, o) => {
    const oo = opponentsOf(o);
    return a + (oo.length ? oo.reduce((x, y) => x + pct(y, o), 0) / oo.length : 0.5);
  }, 0) / opps.length;
  return (2 * ow + oow) / 3;
}

export const formatRecord = (w: number, l: number) => `${w}-${l}`;
