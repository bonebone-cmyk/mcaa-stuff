import { createRng } from '../../rng';
import { generatePlayer } from '../../players/generate';
import { POSITIONS, ROSTER_TEMPLATE, type Position } from '../../players/positions';
import type { SimPlayer, SimTeam } from '../types';

/** Builds a synthetic team of a given talent level for tests and calibration */
export function makeTeam(id: string, quality: number, opts: Partial<SimTeam> = {}): SimTeam {
  const rng = createRng(`fixture-${id}-${quality}`);
  const roster: Partial<Record<Position, SimPlayer[]>> = {};
  for (const pos of POSITIONS) {
    const list: SimPlayer[] = [];
    for (let i = 0; i < ROSTER_TEMPLATE[pos]; i++) {
      const g = generatePlayer(rng, pos, quality, rng.int(0, 3), i);
      list.push({ id: `${id}-${pos}-${i}`, name: `${g.firstName[0]}. ${g.lastName}`, position: pos, overall: g.overall, attrs: g.attributes });
    }
    list.sort((a, b) => b.overall - a.overall);
    roster[pos] = list;
  }
  return {
    id, name: `Team ${id}`, abbr: id.toUpperCase().slice(0, 4), coachRating: 65, homeFieldRating: 60,
    offenseScheme: 'spread', defenseScheme: '4-3', momentum: 0, roster, ...opts,
  };
}
