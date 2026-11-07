import type { Position } from '../players/positions';

export interface SimSettings {
  upsetFrequency: number; // 0-100
  offensiveExplosiveness: number;
  defensiveEffectiveness: number;
  turnoverFrequency: number;
  homeFieldAdvantage: number;
  injuryFrequency: number;
  penaltyFrequency: number;
  randomness: number;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  upsetFrequency: 50,
  offensiveExplosiveness: 50,
  defensiveEffectiveness: 50,
  turnoverFrequency: 50,
  homeFieldAdvantage: 50,
  injuryFrequency: 50,
  penaltyFrequency: 50,
  randomness: 50,
};

export const SIM_SETTING_LABELS: Record<keyof SimSettings, string> = {
  upsetFrequency: 'Upset frequency',
  offensiveExplosiveness: 'Offensive explosiveness',
  defensiveEffectiveness: 'Defensive effectiveness',
  turnoverFrequency: 'Turnover frequency',
  homeFieldAdvantage: 'Home-field advantage',
  injuryFrequency: 'Injury frequency',
  penaltyFrequency: 'Penalty frequency',
  randomness: 'Overall randomness',
};

export interface SimPlayer {
  id: string;
  name: string; // "J. Smith"
  position: Position;
  overall: number;
  attrs: Record<string, number>;
}

export interface SimTeam {
  id: string;
  name: string;
  abbr: string;
  coachRating: number; // 1-99
  homeFieldRating: number; // 0-100
  offenseScheme: string;
  defenseScheme: string;
  /** -1 (cold) … +1 (hot), derived from recent results */
  momentum: number;
  /** players by position, ordered by depth chart (healthy players only) */
  roster: Partial<Record<Position, SimPlayer[]>>;
}

export interface SimInput {
  home: SimTeam;
  away: SimTeam;
  neutralSite: boolean;
  settings: SimSettings;
  seed: string;
}

export type PlayType =
  | 'run' | 'pass' | 'sack' | 'incomplete' | 'interception' | 'fumble' | 'punt' | 'field_goal'
  | 'extra_point' | 'two_point' | 'kickoff' | 'penalty' | 'kneel' | 'safety' | 'end_quarter' | 'injury';

export interface SimPlay {
  seq: number;
  driveNo: number;
  quarter: number; // 5+ = overtime
  clock: number; // seconds remaining in quarter at snap
  offenseTeamId: string;
  down: number | null;
  distance: number | null;
  yardLine: number | null; // 0-100 from offense's own goal line
  playType: PlayType;
  yards: number;
  description: string;
  homeScore: number;
  awayScore: number;
  isScoring: boolean;
  isTurnover: boolean;
  homeWinProb: number;
  /** [playerId, stat, delta] individual stat changes produced by this play */
  statDeltas?: [string, string, number][];
}

export interface SimDrive {
  driveNo: number;
  teamId: string;
  quarter: number;
  startClock: number;
  startYard: number;
  plays: number;
  yards: number;
  durationSeconds: number;
  result: string;
  points: number;
}

export interface TeamStatLine {
  teamId: string;
  points: number;
  firstDowns: number;
  totalYards: number;
  passYards: number;
  rushYards: number;
  passAtt: number;
  passCmp: number;
  rushAtt: number;
  turnovers: number;
  penalties: number;
  penaltyYards: number;
  thirdDownConv: number;
  thirdDownAtt: number;
  sacks: number;
  timeOfPossession: number;
  quarters: number[]; // points per quarter; index 4+ = OT periods
}

export interface PlayerStatLine {
  playerId: string;
  teamId: string;
  name: string;
  position: Position;
  passAtt: number; passCmp: number; passYds: number; passTd: number; passInt: number;
  rushAtt: number; rushYds: number; rushTd: number;
  rec: number; recYds: number; recTd: number;
  tackles: number; sacks: number; tfl: number; defInt: number; forcedFumbles: number;
  fgm: number; fga: number; xpm: number; xpa: number;
  punts: number; puntYds: number;
  kr: number; krYds: number; pr: number; prYds: number;
}

export interface SimInjury {
  playerId: string;
  teamId: string;
  name: string;
  type: string;
  weeks: number;
}

export interface GameResult {
  seed: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  overtimes: number;
  winnerTeamId: string;
  plays: SimPlay[];
  drives: SimDrive[];
  teamStats: { home: TeamStatLine; away: TeamStatLine };
  playerStats: PlayerStatLine[];
  injuries: SimInjury[];
  pregameHomeWinProb: number;
  /** Narrative tags such as "upset", "shootout", "comeback" */
  tags: string[];
  /** Largest deficit the winner overcame */
  maxComeback: number;
}
