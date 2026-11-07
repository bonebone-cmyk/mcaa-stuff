import { clamp, createRng } from '../rng';
import { generateAttributes, randomHometown, randomName } from '../players/generate';
import { DEFENSE_SCHEMES, OFFENSE_POSITIONS, OFFENSE_SCHEMES, type Position } from '../players/positions';
import { randomPriorities, type Priorities } from './engine';

export interface GeneratedRecruit {
  firstName: string;
  lastName: string;
  position: Position;
  hometown: string;
  homeState: string;
  latitude: number;
  longitude: number;
  heightIn: number;
  weight: number;
  classYear: number;
  stars: number;
  overall: number;
  potential: number;
  attributes: Record<string, number>;
  preferredScheme: string | null;
  priorities: Priorities;
  nationalRank: number;
  stateRank: number;
  positionRank: number;
}

const POSITION_MIX: [Position, number][] = [
  ['QB', 7], ['RB', 8], ['WR', 14], ['TE', 6], ['OL', 17], ['DL', 15], ['LB', 11], ['CB', 11], ['S', 8], ['K', 2], ['P', 1],
];
const SIZE: Record<Position, [number, number, number, number]> = {
  QB: [72, 77, 185, 225], RB: [68, 73, 180, 220], WR: [69, 77, 165, 205], TE: [75, 79, 225, 250],
  OL: [75, 80, 280, 330], DL: [74, 79, 250, 305], LB: [72, 76, 210, 240], CB: [69, 74, 165, 190],
  S: [70, 75, 180, 205], K: [69, 75, 170, 200], P: [71, 77, 180, 210],
};

function starsFor(rankPct: number): number {
  if (rankPct < 0.015) return 5;
  if (rankPct < 0.15) return 4;
  if (rankPct < 0.6) return 3;
  if (rankPct < 0.9) return 2;
  return 1;
}

export function generateRecruitClass(seed: string, count: number, classYear: number): GeneratedRecruit[] {
  const rng = createRng(seed);
  // Draw a latent talent score, then rank everybody — star ratings follow national rank
  const raw = Array.from({ length: count }, () => {
    const position = rng.weighted(POSITION_MIX, (p) => p[1])[0];
    const talent = rng.normal(0, 1);
    return { position, talent };
  }).sort((a, b) => b.talent - a.talent);

  const out = raw.map((r, idx) => {
    const pct = idx / count;
    const stars = starsFor(pct);
    const base = { 5: 80, 4: 73, 3: 64, 2: 55, 1: 47 }[stars]!;
    const overall = Math.round(clamp(base + (1 - pct) * 4 + rng.normal(0, 2.5), 40, 90));
    const potential = Math.round(clamp(overall + rng.normal(14, 5) + (stars >= 4 ? 3 : 0), overall + 2, 99));
    const { firstName, lastName } = randomName(rng);
    const home = randomHometown(rng);
    const [hMin, hMax, wMin, wMax] = SIZE[r.position];
    const schemes = OFFENSE_POSITIONS.includes(r.position) ? OFFENSE_SCHEMES : DEFENSE_SCHEMES;
    return {
      firstName, lastName, position: r.position,
      hometown: home.hometown, homeState: home.state, latitude: home.lat, longitude: home.lng,
      heightIn: rng.int(hMin, hMax), weight: rng.int(wMin, wMax), classYear, stars, overall, potential,
      attributes: generateAttributes(rng, r.position, overall),
      preferredScheme: r.position === 'K' || r.position === 'P' || rng.chance(0.35) ? null : rng.pick(schemes),
      priorities: randomPriorities(rng, stars),
      nationalRank: idx + 1, stateRank: 0, positionRank: 0,
    };
  });
  const stateCounts = new Map<string, number>();
  const posCounts = new Map<string, number>();
  for (const r of out) {
    r.stateRank = (stateCounts.get(r.homeState) ?? 0) + 1;
    stateCounts.set(r.homeState, r.stateRank);
    r.positionRank = (posCounts.get(r.position) ?? 0) + 1;
    posCounts.set(r.position, r.positionRank);
  }
  return out;
}

/** Ratings band shown to schools that have not scouted the prospect */
export function ratingBand(value: number, scouted: boolean): string {
  if (scouted) return String(value);
  const lo = Math.min(89, Math.floor((value - 4) / 5) * 5);
  return `${lo}–${Math.min(99, lo + 10)}`;
}
