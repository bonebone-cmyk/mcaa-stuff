/**
 * Offseason player development, redshirts, eligibility and team ratings.
 */
import { clamp, type Rng } from './rng';
import { overallFromAttributes, type Position } from './players/positions';
import { computeUnits } from './sim/engine';
import type { SimPlayer, SimTeam } from './sim/types';

export interface DevPlayer {
  id: string;
  position: Position;
  overall: number;
  potential: number;
  attributes: Record<string, number>;
  devTrait: string;
  seasonsPlayed: number;
  yearsInProgram: number;
  redshirtUsed: boolean;
  gamesPlayed: number; // this season
  performance: number; // 0-1 season production percentile within position
}

export interface DevResult {
  id: string;
  overall: number;
  attributes: Record<string, number>;
  seasonsPlayed: number;
  yearsInProgram: number;
  redshirtUsed: boolean;
  graduated: boolean;
  redshirted: boolean;
  change: number;
}

const TRAIT: Record<string, number> = { normal: 1, impact: 1.2, star: 1.45, elite: 1.75 };

export function developPlayer(p: DevPlayer, coachRating: number, rng: Rng): DevResult {
  // eligibility
  let { seasonsPlayed, yearsInProgram, redshirtUsed } = p;
  let redshirted = false;
  if (p.gamesPlayed <= 4 && !redshirtUsed && seasonsPlayed < 4) {
    redshirtUsed = true;
    redshirted = true;
  } else {
    seasonsPlayed += 1;
  }
  yearsInProgram += 1;
  const graduated = seasonsPlayed >= 4 || yearsInProgram >= 5;

  // progression
  const gap = Math.max(0, p.potential - p.overall);
  const youth = seasonsPlayed <= 2 ? 1 : 0.6;
  const coach = 1 + (coachRating - 60) / 100;
  const playing = 0.85 + Math.min(p.gamesPlayed / 12, 1) * 0.3;
  const perf = 0.9 + p.performance * 0.25;
  const trait = TRAIT[p.devTrait] ?? 1;
  let gain = gap * 0.22 * youth * coach * playing * perf * trait + rng.normal(0.5, 1.4);
  if (p.overall >= 92) gain = Math.min(gain, 2);
  gain = clamp(gain, -3, 14);

  const attributes: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.attributes)) {
    attributes[k] = Math.round(clamp(v + gain + rng.normal(0, 1.2), 25, 99));
  }
  let overall = Object.keys(attributes).length ? overallFromAttributes(p.position, attributes) : Math.round(p.overall + gain);
  overall = clamp(Math.min(overall, Math.max(p.potential, p.overall)), 1, 99);
  return {
    id: p.id, overall, attributes, seasonsPlayed, yearsInProgram, redshirtUsed, graduated, redshirted,
    change: overall - p.overall,
  };
}

/** Team offense / defense / overall from the current (healthy) depth chart */
export function teamRatings(roster: Partial<Record<Position, SimPlayer[]>>): { overall: number; offense: number; defense: number } {
  const team: SimTeam = {
    id: 'x', name: 'x', abbr: 'x', coachRating: 65, homeFieldRating: 50, offenseScheme: 'pro_style',
    defenseScheme: '4-3', momentum: 0, roster,
  };
  const u = computeUnits(team);
  const offense = Math.round((u.passOff + u.rushOff) / 2 - 0.5);
  const defense = Math.round((u.passDef + u.rushDef) / 2 - 0.5);
  return { offense, defense, overall: Math.round(offense * 0.52 + defense * 0.48) };
}
