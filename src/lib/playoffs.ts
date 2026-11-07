/**
 * College Football Playoff field selection and bracket structure for 4, 8, 12
 * or 16 teams. Non power-of-two fields (12) give byes to the top seeds.
 */
export type BidType = 'auto' | 'at_large';
export interface Seed { seed: number; teamId: string; bidType: BidType; conferenceId: string | null }

export function selectField(
  rankedTeamIds: string[], champions: { teamId: string; conferenceId: string }[], size: number, autoBids: number,
): Seed[] {
  const rankOf = new Map(rankedTeamIds.map((id, i) => [id, i]));
  const champConf = new Map(champions.map((c) => [c.teamId, c.conferenceId]));
  const autos = [...champions]
    .sort((a, b) => (rankOf.get(a.teamId) ?? 999) - (rankOf.get(b.teamId) ?? 999))
    .slice(0, Math.min(autoBids, size));
  const field = new Set(autos.map((a) => a.teamId));
  for (const id of rankedTeamIds) {
    if (field.size >= size) break;
    field.add(id);
  }
  const autoSet = new Set(autos.map((a) => a.teamId));
  return [...field]
    .sort((a, b) => (rankOf.get(a) ?? 999) - (rankOf.get(b) ?? 999))
    .map((teamId, i) => ({
      seed: i + 1, teamId, bidType: autoSet.has(teamId) ? 'auto' : 'at_large', conferenceId: champConf.get(teamId) ?? null,
    }));
}

/** Standard bracket order, e.g. 8 -> [1,8,4,5,2,7,3,6] */
export function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

export type Source = { seed: number } | { winnerOf: { round: number; slot: number } };
export interface Matchup { round: number; slot: number; sources: [Source, Source] }

export function bracketRounds(size: number): number {
  let r = 0;
  let n = 1;
  while (n < size) { n *= 2; r++; }
  return r;
}

/** Full bracket as a list of matchups. Bye matchups are removed; their seed feeds directly forward. */
export function buildBracket(size: number): Matchup[] {
  const rounds = bracketRounds(size);
  const full = 2 ** rounds;
  const order = seedOrder(full);
  const matchups: Matchup[] = [];
  // resolved[round][slot] = source representing the winner of that slot
  let prev: Source[] = [];
  for (let i = 0; i < full / 2; i++) {
    const a = order[2 * i];
    const b = order[2 * i + 1];
    if (b > size) prev.push({ seed: a });
    else if (a > size) prev.push({ seed: b });
    else {
      const m: Matchup = { round: 1, slot: i + 1, sources: [{ seed: a }, { seed: b }] };
      matchups.push(m);
      prev.push({ winnerOf: { round: 1, slot: i + 1 } });
    }
  }
  for (let r = 2; r <= rounds; r++) {
    const next: Source[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      const m: Matchup = { round: r, slot: i + 1, sources: [prev[2 * i], prev[2 * i + 1]] };
      matchups.push(m);
      next.push({ winnerOf: { round: r, slot: i + 1 } });
    }
    prev = next;
  }
  return matchups;
}

export function roundName(size: number, round: number): string {
  const total = bracketRounds(size);
  const fromEnd = total - round;
  if (fromEnd === 0) return 'National Championship';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return 'First Round';
}

/** Resolve a matchup's two teams given seeds and known winners. Returns null for unknown sides. */
export function resolveMatchup(
  m: Matchup, seeds: Map<number, string>, winners: Map<string, string>,
): [string | null, string | null] {
  const res = (s: Source) =>
    'seed' in s ? seeds.get(s.seed) ?? null : winners.get(`${s.winnerOf.round}-${s.winnerOf.slot}`) ?? null;
  return [res(m.sources[0]), res(m.sources[1])];
}

/** Lowest seed number that can reach this matchup source — the better seed hosts */
export function bestSeedOf(src: Source, bracket: Matchup[]): number {
  if ('seed' in src) return src.seed;
  const m = bracket.find((x) => x.round === src.winnerOf.round && x.slot === src.winnerOf.slot)!;
  return Math.min(bestSeedOf(m.sources[0], bracket), bestSeedOf(m.sources[1], bracket));
}
