export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as const;
export type Position = (typeof POSITIONS)[number];

export const OFFENSE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_POSITIONS: Position[] = ['DL', 'LB', 'CB', 'S'];
export const SPECIAL_POSITIONS: Position[] = ['K', 'P'];

/** Number of starters per position on the depth chart */
export const STARTERS: Record<Position, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

/** Default demo roster composition (~54 players) */
export const ROSTER_TEMPLATE: Record<Position, number> = {
  QB: 3, RB: 4, WR: 7, TE: 3, OL: 9, DL: 8, LB: 6, CB: 6, S: 5, K: 2, P: 1,
};

/** Attribute keys and their weight in the overall rating, by position */
export const ATTRIBUTE_WEIGHTS: Record<Position, Record<string, number>> = {
  QB: { throwPower: 0.25, throwAccuracy: 0.35, awareness: 0.3, speed: 0.1 },
  RB: { speed: 0.3, carrying: 0.2, elusiveness: 0.3, strength: 0.2 },
  WR: { speed: 0.3, catching: 0.3, routeRunning: 0.3, release: 0.1 },
  TE: { catching: 0.4, blocking: 0.4, speed: 0.2 },
  OL: { passBlock: 0.4, runBlock: 0.4, strength: 0.2 },
  DL: { passRush: 0.4, runStop: 0.4, strength: 0.2 },
  LB: { tackling: 0.35, coverage: 0.25, passRush: 0.15, speed: 0.25 },
  CB: { coverage: 0.5, speed: 0.3, ballSkills: 0.2 },
  S: { coverage: 0.35, tackling: 0.35, speed: 0.3 },
  K: { kickPower: 0.5, kickAccuracy: 0.5 },
  P: { kickPower: 0.6, kickAccuracy: 0.4 },
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  throwPower: 'Throw Power', throwAccuracy: 'Throw Accuracy', awareness: 'Awareness', speed: 'Speed',
  carrying: 'Carrying', elusiveness: 'Elusiveness', strength: 'Strength', catching: 'Catching',
  routeRunning: 'Route Running', release: 'Release', blocking: 'Blocking', passBlock: 'Pass Block',
  runBlock: 'Run Block', passRush: 'Pass Rush', runStop: 'Run Stop', tackling: 'Tackling',
  coverage: 'Coverage', ballSkills: 'Ball Skills', kickPower: 'Kick Power', kickAccuracy: 'Kick Accuracy',
};

export function overallFromAttributes(position: Position, attrs: Record<string, number>): number {
  const weights = ATTRIBUTE_WEIGHTS[position];
  let total = 0;
  let sum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (typeof attrs[k] === 'number') {
      total += attrs[k] * w;
      sum += w;
    }
  }
  return sum === 0 ? 50 : Math.round(total / sum);
}

export const OFFENSE_SCHEMES = ['spread', 'air_raid', 'pro_style', 'west_coast', 'power_run', 'option', 'rpo'] as const;
export const DEFENSE_SCHEMES = ['4-3', '3-4', '4-2-5', '3-3-5', '46'] as const;
export type OffenseScheme = (typeof OFFENSE_SCHEMES)[number];
export type DefenseScheme = (typeof DEFENSE_SCHEMES)[number];

export const SCHEME_LABELS: Record<string, string> = {
  spread: 'Spread', air_raid: 'Air Raid', pro_style: 'Pro Style', west_coast: 'West Coast',
  power_run: 'Power Run', option: 'Triple Option', rpo: 'RPO',
  '4-3': '4-3 Base', '3-4': '3-4 Base', '4-2-5': '4-2-5 Nickel', '3-3-5': '3-3-5 Stack', '46': '46 Bear',
};

/** Which schemes suit which positions (used for recruit scheme fit) */
export function schemeFitsPosition(scheme: string, position: Position): number {
  const offense: Record<string, Partial<Record<Position, number>>> = {
    air_raid: { QB: 1, WR: 1, RB: -0.5, TE: -0.5 },
    spread: { QB: 0.6, WR: 0.7, RB: 0.3 },
    pro_style: { QB: 0.6, TE: 1, OL: 0.6, RB: 0.5 },
    west_coast: { QB: 0.8, WR: 0.6, TE: 0.6 },
    power_run: { RB: 1, OL: 1, TE: 0.6, WR: -0.5 },
    option: { QB: 0.5, RB: 1, OL: 0.6, WR: -1 },
    rpo: { QB: 0.8, RB: 0.6, WR: 0.4 },
  };
  const defense: Record<string, Partial<Record<Position, number>>> = {
    '4-3': { DL: 0.8, LB: 0.6 },
    '3-4': { LB: 1, DL: 0.4 },
    '4-2-5': { CB: 0.8, S: 0.8 },
    '3-3-5': { S: 1, CB: 0.6, LB: 0.4 },
    '46': { DL: 1, LB: 0.6, S: 0.3 },
  };
  return offense[scheme]?.[position] ?? defense[scheme]?.[position] ?? 0;
}

export function classLabel(seasonsPlayed: number, redshirtUsed: boolean, status?: string): string {
  if (status === 'graduated') return 'Graduated';
  const base = ['FR', 'SO', 'JR', 'SR', 'SR', 'SR'][Math.min(seasonsPlayed, 5)];
  if (seasonsPlayed >= 4) return 'GR';
  return redshirtUsed ? `RS ${base}` : base;
}

export function formatHeight(inches: number | null | undefined): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
