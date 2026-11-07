/**
 * Season schedule generator.
 *
 * Builds a full regular season week by week as a sequence of matchings, so a
 * team can never play twice in a week and no pairing repeats. Annual rivalries
 * are locked into rivalry week (the final regular-season week) first, early
 * weeks prefer non-conference games, the middle of the season prefers
 * conference games, and several randomized attempts are scored so the best
 * schedule (fewest missing games, best home/away balance) is returned.
 */
import { createRng, type Rng } from '../rng';

export interface ScheduleTeam { id: string; conferenceId: string | null; prestige?: number }
export interface ScheduleConference { id: string; conferenceGames: number }
export interface ScheduleRivalry { id: string; teamAId: string; teamBId: string; annual: boolean }

export interface ScheduledGame {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  isConferenceGame: boolean;
  conferenceId: string | null;
  rivalryId: string | null;
}

export interface ScheduleOptions {
  weeks: number;
  gamesPerTeam: number;
  seed: string;
  attempts?: number;
  nonConferenceWeeks?: number; // weeks at the start that prefer non-conference opponents
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function attempt(teams: ScheduleTeam[], confs: Map<string, ScheduleConference>, rivalries: ScheduleRivalry[], opts: ScheduleOptions, rng: Rng) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const confSize = new Map<string, number>();
  for (const t of teams) if (t.conferenceId) confSize.set(t.conferenceId, (confSize.get(t.conferenceId) ?? 0) + 1);

  const confLeft = new Map<string, number>();
  const nonLeft = new Map<string, number>();
  const homeCount = new Map<string, number>();
  for (const t of teams) {
    const c = t.conferenceId ? confs.get(t.conferenceId) : undefined;
    const conf = c ? Math.min(c.conferenceGames, (confSize.get(t.conferenceId!) ?? 1) - 1, opts.gamesPerTeam) : 0;
    confLeft.set(t.id, conf);
    nonLeft.set(t.id, opts.gamesPerTeam - conf);
    homeCount.set(t.id, 0);
  }
  const played = new Set<string>();
  const rivalryByPair = new Map(rivalries.map((r) => [pairKey(r.teamAId, r.teamBId), r]));
  const games: ScheduledGame[] = [];
  const sameConf = (a: string, b: string) => {
    const ca = byId.get(a)?.conferenceId;
    return !!ca && ca === byId.get(b)?.conferenceId;
  };
  const canPlay = (a: string, b: string) => {
    if (a === b || played.has(pairKey(a, b))) return false;
    if (sameConf(a, b)) return confLeft.get(a)! > 0 && confLeft.get(b)! > 0;
    return nonLeft.get(a)! > 0 && nonLeft.get(b)! > 0;
  };
  const remaining = (id: string) => confLeft.get(id)! + nonLeft.get(id)!;
  const book = (week: number, a: string, b: string) => {
    const conf = sameConf(a, b);
    if (conf) { confLeft.set(a, confLeft.get(a)! - 1); confLeft.set(b, confLeft.get(b)! - 1); }
    else { nonLeft.set(a, nonLeft.get(a)! - 1); nonLeft.set(b, nonLeft.get(b)! - 1); }
    played.add(pairKey(a, b));
    const ha = homeCount.get(a)!;
    const hb = homeCount.get(b)!;
    const aHome = ha === hb ? rng.chance(0.5) : ha < hb;
    const [home, away] = aHome ? [a, b] : [b, a];
    homeCount.set(home, homeCount.get(home)! + 1);
    games.push({
      week, homeTeamId: home, awayTeamId: away, isConferenceGame: conf,
      conferenceId: conf ? byId.get(a)!.conferenceId : null,
      rivalryId: rivalryByPair.get(pairKey(a, b))?.id ?? null,
    });
  };

  const nonConfWeeks = opts.nonConferenceWeeks ?? 3;
  // Lock annual rivalries first: as late in the season as both teams are free (rivalry week preferred)
  const busyByWeek = new Map<number, Set<string>>();
  for (let w = 1; w <= opts.weeks; w++) busyByWeek.set(w, new Set());
  for (const r of rng.shuffle([...rivalries])) {
    if (!r.annual || !byId.has(r.teamAId) || !byId.has(r.teamBId) || !canPlay(r.teamAId, r.teamBId)) continue;
    for (let w = opts.weeks; w >= 1; w--) {
      const busyW = busyByWeek.get(w)!;
      if (busyW.has(r.teamAId) || busyW.has(r.teamBId)) continue;
      book(w, r.teamAId, r.teamBId);
      busyW.add(r.teamAId); busyW.add(r.teamBId);
      break;
    }
  }
  for (let week = 1; week <= opts.weeks; week++) {
    const weeksLeft = opts.weeks - week + 1;
    const busy = busyByWeek.get(week)!;
    const reservedNon = new Set<string>();
    const order = rng.shuffle(teams.map((t) => t.id)).sort((a, b) => remaining(b) / weeksLeft - remaining(a) / weeksLeft);
    for (const t of order) {
      if (busy.has(t) || remaining(t) === 0) continue;
      // a bye is fine only when the team has spare weeks
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const u of order) {
        if (busy.has(u) || !canPlay(t, u)) continue;
        const conf = sameConf(t, u);
        if (!conf && (reservedNon.has(t) || reservedNon.has(u))) {
          // keep the last non-conference slot open for a rivalry game
          if ((reservedNon.has(t) && nonLeft.get(t)! <= 1) || (reservedNon.has(u) && nonLeft.get(u)! <= 1)) continue;
        }
        let score = rng.next();
        if (week <= nonConfWeeks) score += conf ? 0 : 6;
        else score += conf ? 6 : 0;
        // prefer partners who are short on remaining weeks
        score += (remaining(u) / weeksLeft) * 4;
        // keep conference games for later weeks when lots remain
        if (conf && confLeft.get(t)! >= weeksLeft - 1) score += 8;
        if (!conf && nonLeft.get(t)! >= weeksLeft - 1) score += 8;
        if (score > bestScore) { bestScore = score; best = u; }
      }
      if (best) {
        book(week, t, best);
        busy.add(t); busy.add(best);
      }
    }
  }
  let missing = 0;
  for (const t of teams) missing += remaining(t.id);
  let imbalance = 0;
  for (const t of teams) imbalance += Math.abs(homeCount.get(t.id)! * 2 - (opts.gamesPerTeam - remaining(t.id)));
  return { games, missing, imbalance };
}

export function generateSchedule(
  teams: ScheduleTeam[], conferences: ScheduleConference[], rivalries: ScheduleRivalry[], opts: ScheduleOptions,
): ScheduledGame[] {
  const confs = new Map(conferences.map((c) => [c.id, c]));
  const teamIds = new Set(teams.map((t) => t.id));
  const valid = rivalries.filter((r) => teamIds.has(r.teamAId) && teamIds.has(r.teamBId));
  const rng = createRng(opts.seed);
  let best: ReturnType<typeof attempt> | null = null;
  for (let i = 0; i < (opts.attempts ?? 12); i++) {
    const res = attempt(teams, confs, valid, opts, rng.fork(`attempt-${i}`));
    if (!best || res.missing < best.missing || (res.missing === best.missing && res.imbalance < best.imbalance)) best = res;
    if (best.missing === 0 && best.imbalance <= teams.length) break;
  }
  return best!.games.sort((a, b) => a.week - b.week);
}

// ---------------------------------------------------------------------------
// Broadcast assignment: kickoff times and TV networks by matchup quality
// ---------------------------------------------------------------------------
export interface Network { id: string; tier: number }

const SLOTS = ['12:00', '15:30', '19:30', '15:30', '12:00', '19:00', '22:30', '16:00', '20:00', '12:00'];

function easternOffset(date: Date): string {
  // DST ends the first Sunday of November
  const y = date.getUTCFullYear();
  const nov1 = new Date(Date.UTC(y, 10, 1));
  const firstSunday = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = Date.UTC(y, 10, firstSunday);
  return date.getTime() >= dstEnd ? '-05:00' : '-04:00';
}

/** First Saturday on/after Aug 29 of the year = week 1 */
export function seasonStartSaturday(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 29));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function assignBroadcasts<T extends { week: number; homeTeamId: string; awayTeamId: string }>(
  games: T[], prestige: Map<string, number>, networks: Network[], year: number, seed: string,
): (T & { kickoffAt: string; tvNetworkId: string | null; isGameOfWeek: boolean })[] {
  const rng = createRng(`${seed}-broadcast`);
  const start = seasonStartSaturday(year);
  const byWeek = new Map<number, T[]>();
  for (const g of games) byWeek.set(g.week, [...(byWeek.get(g.week) ?? []), g]);
  const tiers = [...networks].sort((a, b) => a.tier - b.tier);
  const out: (T & { kickoffAt: string; tvNetworkId: string | null; isGameOfWeek: boolean })[] = [];
  for (const [week, list] of byWeek) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + (week - 1) * 7);
    const ymd = date.toISOString().slice(0, 10);
    const offset = easternOffset(date);
    const ranked = [...list].sort((a, b) =>
      (prestige.get(b.homeTeamId) ?? 50) + (prestige.get(b.awayTeamId) ?? 50) -
      ((prestige.get(a.homeTeamId) ?? 50) + (prestige.get(a.awayTeamId) ?? 50)));
    ranked.forEach((g, i) => {
      const slot = i < SLOTS.length ? SLOTS[i] : rng.pick(['12:00', '14:00', '15:30', '18:00', '19:00', '21:00']);
      const net = tiers.length
        ? i < 3 ? tiers[i % Math.min(3, tiers.length)] : tiers[Math.min(tiers.length - 1, 1 + Math.floor(rng.next() * (tiers.length - 1)))]
        : null;
      out.push({ ...g, kickoffAt: `${ymd}T${slot}:00${offset}`, tvNetworkId: net?.id ?? null, isGameOfWeek: i === 0 });
    });
  }
  return out;
}
