/**
 * College Football Universe — server-side game simulation engine.
 *
 * A play-by-play state machine (downs, distance, field position, game clock,
 * possession, kicking game, college overtime). Every statistic, drive and the
 * final score are derived from the generated plays, so box scores are always
 * internally consistent with the result. The engine is pure and deterministic:
 * the same input + seed always produces the same game.
 */
import { createRng, clamp, type Rng } from '../rng';
import type { Position } from '../players/positions';
import type {
  GameResult, PlayerStatLine, PlayType, SimDrive, SimInjury, SimInput, SimPlay, SimPlayer, SimSettings,
  SimTeam, TeamStatLine,
} from './types';

// ---------------------------------------------------------------------------
// Unit ratings
// ---------------------------------------------------------------------------
export interface UnitRatings {
  passOff: number;
  rushOff: number;
  passDef: number;
  rushDef: number;
  kickPower: number;
  kickAccuracy: number;
  puntPower: number;
  qbSpeed: number;
}

const attr = (p: SimPlayer | undefined, key: string, fallback = 40) =>
  p ? (p.attrs[key] ?? p.overall) : fallback;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 40);

function topN(team: SimTeam, pos: Position, n: number, injured: Set<string>): SimPlayer[] {
  return (team.roster[pos] ?? []).filter((p) => !injured.has(p.id)).slice(0, n);
}

const OFF_SCHEME: Record<string, { passRate: number; pass: number; rush: number; deep: number }> = {
  air_raid: { passRate: 0.62, pass: 2, rush: -2, deep: 0.05 },
  spread: { passRate: 0.53, pass: 1, rush: 1, deep: 0.02 },
  west_coast: { passRate: 0.56, pass: 1.5, rush: -0.5, deep: -0.04 },
  pro_style: { passRate: 0.5, pass: 0.5, rush: 0.5, deep: 0 },
  rpo: { passRate: 0.48, pass: 0.5, rush: 1.5, deep: -0.01 },
  power_run: { passRate: 0.38, pass: -1.5, rush: 2.5, deep: 0.01 },
  option: { passRate: 0.27, pass: -3, rush: 3, deep: 0.03 },
};
const DEF_SCHEME: Record<string, { pass: number; rush: number }> = {
  '4-3': { pass: 0, rush: 1 },
  '3-4': { pass: 1, rush: 0 },
  '4-2-5': { pass: 1.5, rush: -1 },
  '3-3-5': { pass: 2, rush: -2 },
  '46': { pass: -2.5, rush: 3 },
};

export function computeUnits(team: SimTeam, injured: Set<string> = new Set()): UnitRatings {
  const qb = topN(team, 'QB', 1, injured)[0];
  const rb = topN(team, 'RB', 1, injured)[0];
  const wrs = topN(team, 'WR', 3, injured);
  const te = topN(team, 'TE', 1, injured)[0];
  const ol = topN(team, 'OL', 5, injured);
  const dl = topN(team, 'DL', 4, injured);
  const lbs = topN(team, 'LB', 3, injured);
  const cbs = topN(team, 'CB', 2, injured);
  const ss = topN(team, 'S', 2, injured);
  const k = topN(team, 'K', 1, injured)[0];
  const p = topN(team, 'P', 1, injured)[0] ?? k;

  const pad = (xs: number[], n: number) => [...xs, ...Array(Math.max(0, n - xs.length)).fill(35)];
  const qbPass = 0.4 * attr(qb, 'throwAccuracy') + 0.3 * attr(qb, 'throwPower') + 0.3 * attr(qb, 'awareness');
  const wr = avg(pad(wrs.map((w) => (attr(w, 'catching') + attr(w, 'routeRunning') + attr(w, 'speed')) / 3), 3));
  const teCatch = attr(te, 'catching');
  const teBlock = attr(te, 'blocking');
  const olPass = avg(pad(ol.map((o) => attr(o, 'passBlock')), 5));
  const olRun = avg(pad(ol.map((o) => attr(o, 'runBlock')), 5));
  const rbR = (attr(rb, 'speed') + attr(rb, 'elusiveness') + attr(rb, 'carrying') + attr(rb, 'strength')) / 4;
  const dlRush = avg(pad(dl.map((d) => attr(d, 'passRush')), 4));
  const dlRun = avg(pad(dl.map((d) => attr(d, 'runStop')), 4));
  const lbRun = avg(pad(lbs.map((l) => (attr(l, 'tackling') + attr(l, 'speed')) / 2), 3));
  const lbCov = avg(pad(lbs.map((l) => attr(l, 'coverage')), 3));
  const cb = avg(pad(cbs.map((c) => attr(c, 'coverage')), 2));
  const s = avg(pad(ss.map((x) => (attr(x, 'coverage') + attr(x, 'tackling')) / 2), 2));

  const off = OFF_SCHEME[team.offenseScheme] ?? OFF_SCHEME.spread;
  const def = DEF_SCHEME[team.defenseScheme] ?? DEF_SCHEME['4-3'];
  const coach = (team.coachRating - 65) / 12;

  return {
    passOff: 0.42 * qbPass + 0.28 * wr + 0.08 * teCatch + 0.22 * olPass + off.pass + coach,
    rushOff: 0.38 * rbR + 0.42 * olRun + 0.1 * teBlock + 0.1 * attr(qb, 'speed') + off.rush + coach,
    passDef: 0.35 * cb + 0.2 * s + 0.3 * dlRush + 0.15 * lbCov + def.pass + coach,
    rushDef: 0.45 * dlRun + 0.35 * lbRun + 0.2 * s + def.rush + coach,
    kickPower: attr(k, 'kickPower', 55),
    kickAccuracy: attr(k, 'kickAccuracy', 55),
    puntPower: attr(p, 'kickPower', 55),
    qbSpeed: attr(qb, 'speed', 50),
  };
}

/** Composite strength used for pregame expectations (points scale ~ rating scale) */
export function teamStrength(u: UnitRatings): number {
  return (u.passOff + u.rushOff) / 2 * 0.52 + (u.passDef + u.rushDef) / 2 * 0.48;
}

const POINTS_PER_RATING = 1.38;
/** rating points of unit advantage that equal one 'edge' unit on a single play */
const EDGE_SCALE = 14;
const HOME_FIELD_POINTS = 3.0;

export function homeFieldBonus(home: SimTeam, neutral: boolean, s: SimSettings): number {
  if (neutral) return 0;
  return (0.6 + 0.8 * (home.homeFieldRating / 100)) * HOME_FIELD_POINTS * (s.homeFieldAdvantage / 50);
}

/** Expected home margin (points) from ratings alone */
export function expectedMargin(input: Pick<SimInput, 'home' | 'away' | 'neutralSite' | 'settings'>): number {
  const h = teamStrength(computeUnits(input.home));
  const a = teamStrength(computeUnits(input.away));
  const mom = (input.home.momentum - input.away.momentum) * 1.5;
  return (h - a) * POINTS_PER_RATING + homeFieldBonus(input.home, input.neutralSite, input.settings) + mom;
}

// Standard normal CDF (Abramowitz-Stegun approximation)
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function pregameWinProbability(margin: number, settings: SimSettings): number {
  // higher upset frequency widens the outcome distribution
  const sd = 13 + 8 * (settings.upsetFrequency / 100) + 3 * (settings.randomness / 100);
  return normCdf(margin / sd);
}

// ---------------------------------------------------------------------------
// Game state machine
// ---------------------------------------------------------------------------
interface Side {
  team: SimTeam;
  isHome: boolean;
  units: UnitRatings;
  form: number; // game-day rating swing
  bonus: number; // home field + momentum
  injured: Set<string>;
  rbCarries: Map<string, number>;
}

type Stat = Omit<PlayerStatLine, 'playerId' | 'teamId' | 'name' | 'position'>;
const emptyStat = (): Stat => ({
  passAtt: 0, passCmp: 0, passYds: 0, passTd: 0, passInt: 0, rushAtt: 0, rushYds: 0, rushTd: 0,
  rec: 0, recYds: 0, recTd: 0, tackles: 0, sacks: 0, tfl: 0, defInt: 0, forcedFumbles: 0,
  fgm: 0, fga: 0, xpm: 0, xpa: 0, punts: 0, puntYds: 0, kr: 0, krYds: 0, pr: 0, prYds: 0,
});
const emptyTeamStat = (teamId: string): TeamStatLine => ({
  teamId, points: 0, firstDowns: 0, totalYards: 0, passYards: 0, rushYards: 0, passAtt: 0, passCmp: 0,
  rushAtt: 0, turnovers: 0, penalties: 0, penaltyYards: 0, thirdDownConv: 0, thirdDownAtt: 0, sacks: 0,
  timeOfPossession: 0, quarters: [0, 0, 0, 0],
});

const QUARTER_SECONDS = 900;

class GameSim {
  rng: Rng;
  s: SimSettings;
  sides: [Side, Side]; // 0 = home, 1 = away
  score: [number, number] = [0, 0];
  quarter = 1;
  clock = QUARTER_SECONDS;
  poss: 0 | 1 = 0;
  yardLine = 25;
  down = 1;
  distance = 10;
  seq = 0;
  driveNo = 0;
  plays: SimPlay[] = [];
  drives: SimDrive[] = [];
  currentDrive: SimDrive | null = null;
  teamStats: [TeamStatLine, TeamStatLine];
  playerStats = new Map<string, PlayerStatLine>();
  touched = new Map<string, PlayerStatLine>();
  injuries: SimInjury[] = [];
  openingReceiver: 0 | 1 = 0;
  overtime = 0;
  maxDeficit: [number, number] = [0, 0];
  pregameMargin: number;
  defensivePlaysThisDrive = 0;
  // knobs derived from settings
  explosive: number;
  defEff: number;
  toFreq: number;
  penFreq: number;
  injFreq: number;
  variance: number;

  constructor(private input: SimInput) {
    this.rng = createRng(input.seed);
    this.s = input.settings;
    this.explosive = clamp(this.s.offensiveExplosiveness / 50, 0.1, 2);
    this.defEff = clamp(this.s.defensiveEffectiveness / 50, 0.1, 2);
    this.toFreq = clamp(this.s.turnoverFrequency / 50, 0, 2);
    this.penFreq = clamp(this.s.penaltyFrequency / 50, 0, 2);
    this.injFreq = clamp(this.s.injuryFrequency / 50, 0, 2);
    this.variance = 0.75 + 0.5 * (this.s.randomness / 100);

    const formSd = 1.2 + 4.5 * (this.s.upsetFrequency / 100) + 2 * (this.s.randomness / 100);
    const formRng = this.rng.fork('form');
    const mk = (team: SimTeam, isHome: boolean): Side => ({
      team,
      isHome,
      units: computeUnits(team),
      form: formRng.normal(0, formSd),
      bonus:
        (isHome ? homeFieldBonus(team, input.neutralSite, this.s) / POINTS_PER_RATING : 0) +
        clamp(team.momentum, -1, 1) * 1.2,
      injured: new Set(),
      rbCarries: new Map(),
    });
    this.sides = [mk(input.home, true), mk(input.away, false)];
    this.teamStats = [emptyTeamStat(input.home.id), emptyTeamStat(input.away.id)];
    this.pregameMargin = expectedMargin(input);
  }

  // ------------------------------------------------------------- helpers
  get off() { return this.sides[this.poss]; }
  get def() { return this.sides[1 - this.poss]; }

  player(side: Side, pos: Position, idx = 0): SimPlayer | undefined {
    const list = (side.team.roster[pos] ?? []).filter((p) => !side.injured.has(p.id));
    return list[Math.min(idx, list.length - 1)];
  }

  stat(side: Side, p: SimPlayer | undefined): Stat | null {
    if (!p) return null;
    let line = this.playerStats.get(p.id);
    if (!line) {
      line = { playerId: p.id, teamId: side.team.id, name: p.name, position: p.position, ...emptyStat() };
      this.playerStats.set(p.id, line);
    }
    if (!this.touched.has(p.id)) this.touched.set(p.id, { ...line });
    return line;
  }

  /** Per-play individual stat changes, so a live replay can show running player stats */
  flushDeltas(): [string, string, number][] {
    const out: [string, string, number][] = [];
    for (const [id, before] of this.touched) {
      const now = this.playerStats.get(id)! as unknown as Record<string, number>;
      for (const k of Object.keys(before) as (keyof Stat)[]) {
        const prev = (before as unknown as Record<string, number>)[k];
        if (typeof prev === 'number' && now[k] !== prev) out.push([id, k, Math.round((now[k] - prev) * 10) / 10]);
      }
    }
    this.touched.clear();
    return out;
  }

  eff(side: Side, unit: keyof UnitRatings): number {
    return side.units[unit] + side.form + side.bonus;
  }

  fieldLabel(yardLine = this.yardLine): string {
    if (yardLine === 50) return '50';
    if (yardLine < 50) return `${this.off.team.abbr} ${yardLine}`;
    return `${this.def.team.abbr} ${100 - yardLine}`;
  }

  downLabel(): string {
    const ord = ['', '1st', '2nd', '3rd', '4th'][this.down] ?? `${this.down}th`;
    const dist = this.yardLine + this.distance >= 100 ? 'Goal' : String(this.distance);
    return `${ord} & ${dist} at ${this.fieldLabel()}`;
  }

  homeWinProb(atSnap = true): number {
    const lead = this.score[0] - this.score[1];
    let secondsLeft: number;
    if (this.quarter <= 4) secondsLeft = (4 - this.quarter) * QUARTER_SECONDS + this.clock;
    else secondsLeft = 120; // overtime: roughly a coin flip weighted by lead/possession
    const frac = secondsLeft / 3600;
    const ep = atSnap ? clamp((this.yardLine - 25) / 15, -1, 5) * (this.poss === 0 ? 1 : -1) : 0;
    const mu = lead + ep + this.pregameMargin * frac;
    const sigma = 14 * Math.sqrt(frac) + 0.9;
    return clamp(normCdf(mu / sigma), 0.001, 0.999);
  }

  log(
    playType: PlayType, yards: number, description: string,
    opts: { scoring?: boolean; turnover?: boolean; noDown?: boolean } = {},
  ) {
    this.plays.push({
      seq: ++this.seq,
      driveNo: this.driveNo,
      quarter: this.quarter,
      clock: this.clock,
      offenseTeamId: this.off.team.id,
      down: opts.noDown ? null : this.down,
      distance: opts.noDown ? null : this.distance,
      yardLine: opts.noDown ? null : this.yardLine,
      playType,
      yards,
      description,
      homeScore: this.score[0],
      awayScore: this.score[1],
      isScoring: !!opts.scoring,
      isTurnover: !!opts.turnover,
      homeWinProb: 0, // filled after the play resolves
    });
  }

  finalizeLastPlayProb() {
    const last = this.plays[this.plays.length - 1];
    if (last) {
      const deltas = this.flushDeltas();
      if (deltas.length) last.statDeltas = [...(last.statDeltas ?? []), ...deltas];
      last.homeScore = this.score[0];
      last.awayScore = this.score[1];
      last.homeWinProb = Math.round(this.homeWinProb(last.down !== null && last.playType !== 'field_goal' && !last.isScoring) * 1000) / 1000;
    }
  }

  addPoints(sideIdx: 0 | 1, pts: number) {
    this.score[sideIdx] += pts;
    this.teamStats[sideIdx].points += pts;
    const qi = this.quarter - 1;
    while (this.teamStats[sideIdx].quarters.length <= qi) {
      this.teamStats[0].quarters.push(0);
      this.teamStats[1].quarters.push(0);
    }
    this.teamStats[sideIdx].quarters[qi] += pts;
    for (const i of [0, 1] as const) {
      const deficit = this.score[1 - i] - this.score[i];
      if (deficit > this.maxDeficit[i]) this.maxDeficit[i] = deficit;
    }
    if (this.currentDrive && this.currentDrive.teamId === this.sides[sideIdx].team.id && this.currentDrive.result === 'In progress') this.currentDrive.points += pts;
  }

  runClock(seconds: number) {
    const used = Math.min(seconds, this.clock);
    this.clock -= used;
    this.teamStats[this.poss].timeOfPossession += used;
    if (this.currentDrive) this.currentDrive.durationSeconds += used;
  }

  startDrive(possession: 0 | 1, yardLine: number) {
    this.poss = possession;
    this.yardLine = yardLine;
    this.down = 1;
    this.distance = Math.min(10, 100 - yardLine);
    this.driveNo += 1;
    this.defensivePlaysThisDrive = 0;
    this.currentDrive = {
      driveNo: this.driveNo, teamId: this.off.team.id, quarter: this.quarter, startClock: this.clock,
      startYard: yardLine, plays: 0, yards: 0, durationSeconds: 0, result: 'In progress', points: 0,
    };
    this.drives.push(this.currentDrive);
  }

  endDrive(result: string) {
    if (this.currentDrive && this.currentDrive.result === 'In progress') this.currentDrive.result = result;
  }

  tackler(side: Side, kind: 'run' | 'pass' | 'deep'): SimPlayer | undefined {
    const groups: [Position, number, number][] =
      kind === 'run'
        ? [['LB', 0.42, 3], ['DL', 0.24, 4], ['S', 0.22, 2], ['CB', 0.12, 2]]
        : kind === 'pass'
          ? [['LB', 0.3, 3], ['CB', 0.35, 2], ['S', 0.28, 2], ['DL', 0.07, 4]]
          : [['S', 0.5, 2], ['CB', 0.45, 2], ['LB', 0.05, 3]];
    const g = this.rng.weighted(groups, (x) => x[1]);
    return this.player(side, g[0], this.rng.int(0, g[2] - 1));
  }

  maybeInjure(side: Side, p: SimPlayer | undefined) {
    if (!p || !this.rng.chance(0.0016 * this.injFreq)) return;
    const pool = side.team.roster[p.position] ?? [];
    if (pool.filter((x) => !side.injured.has(x.id)).length <= 1) return; // never leave a position empty
    const roll = this.rng.next();
    const weeks = roll < 0.5 ? 1 : roll < 0.8 ? this.rng.int(2, 3) : roll < 0.95 ? this.rng.int(4, 8) : 12;
    const type = this.rng.pick(
      weeks >= 12 ? ['Torn ACL', 'Broken leg', 'Achilles'] :
      weeks >= 4 ? ['High ankle sprain', 'Broken hand', 'MCL sprain', 'Shoulder separation'] :
      ['Ankle sprain', 'Concussion protocol', 'Hamstring strain', 'Bruised ribs', 'Knee contusion'],
    );
    side.injured.add(p.id);
    side.units = computeUnits(side.team, side.injured);
    this.injuries.push({ playerId: p.id, teamId: side.team.id, name: p.name, type, weeks });
    this.log('injury', 0, `INJURY: ${p.name} (${side.team.abbr} ${p.position}) is down — ${type}.`, { noDown: true });
    this.finalizeLastPlayProb();
  }

  // ------------------------------------------------------------- kicking game
  kickoff(kickingIdx: 0 | 1, opts: { onsideOk?: boolean } = {}) {
    const kicking = this.sides[kickingIdx];
    const receivingIdx = (1 - kickingIdx) as 0 | 1;
    const receiving = this.sides[receivingIdx];
    const lead = this.score[kickingIdx] - this.score[receivingIdx];
    const onside = opts.onsideOk && this.quarter >= 4 && this.clock < 180 && lead < 0 && lead >= -16;
    this.poss = kickingIdx;
    if (onside) {
      const recovered = this.rng.chance(0.12);
      this.log('kickoff', 0, `${kicking.team.abbr} attempts an onside kick… ${recovered ? `RECOVERED by ${kicking.team.abbr}!` : `recovered by ${receiving.team.abbr}.`}`, { noDown: true });
      this.runClock(3);
      this.finalizeLastPlayProb();
      if (recovered) this.startDrive(kickingIdx, 48);
      else this.startDrive(receivingIdx, 52);
      return;
    }
    if (this.rng.chance(0.58 * clamp(kicking.units.kickPower / 75, 0.6, 1.3))) {
      this.log('kickoff', 0, `${kicking.team.abbr} kicks off. Touchback.`, { noDown: true });
      this.finalizeLastPlayProb();
      this.startDrive(receivingIdx, 25);
      return;
    }
    const returner = this.player(receiving, this.rng.chance(0.5) ? 'RB' : 'WR', 1) ?? this.player(receiving, 'WR');
    const st = this.stat(receiving, returner);
    if (this.rng.chance(0.006 * this.explosive)) {
      if (st) { st.kr += 1; st.krYds += 100; }
      this.runClock(14);
      this.poss = receivingIdx;
      this.addPoints(receivingIdx, 6);
      this.log('kickoff', 100, `${returner?.name ?? receiving.team.abbr} returns the kickoff 100 yards for a TOUCHDOWN!`, { scoring: true, noDown: true });
      this.finalizeLastPlayProb();
      this.pointAfter(receivingIdx);
      this.kickoff(receivingIdx, { onsideOk: true });
      return;
    }
    const ret = Math.round(clamp(this.rng.normal(23, 7 * this.variance), 8, 55));
    if (st) { st.kr += 1; st.krYds += ret; }
    this.runClock(this.rng.int(5, 8));
    this.log('kickoff', ret, `${kicking.team.abbr} kicks off. ${returner?.name ?? 'Returner'} returns it to the ${ret < 50 ? `${receiving.team.abbr} ${ret}` : `${kicking.team.abbr} ${100 - ret}`}.`, { noDown: true });
    this.finalizeLastPlayProb();
    this.startDrive(receivingIdx, ret);
  }

  pointAfter(scoringIdx: 0 | 1, forceTwo = false) {
    this.poss = scoringIdx;
    const side = this.sides[scoringIdx];
    const lead = this.score[scoringIdx] - this.score[1 - scoringIdx];
    const goForTwo = forceTwo || (this.quarter >= 4 && this.overtime === 0 && [-2, -5, -10, -13, 1, 5, 12].includes(lead) && this.rng.chance(0.85));
    if (goForTwo) {
      const edge = (this.eff(side, 'passOff') - this.eff(this.sides[1 - scoringIdx], 'passDef')) / 12;
      const ok = this.rng.chance(clamp(0.45 + 0.05 * edge, 0.25, 0.7));
      if (ok) this.addPoints(scoringIdx, 2);
      this.log('two_point', 0, `Two-point conversion attempt by ${side.team.abbr} is ${ok ? 'GOOD' : 'no good'}.`, { scoring: ok, noDown: true });
    } else {
      const k = this.player(side, 'K');
      const st = this.stat(side, k);
      const ok = this.rng.chance(clamp(0.93 + (side.units.kickAccuracy - 70) / 400, 0.85, 0.995));
      if (st) { st.xpa += 1; if (ok) st.xpm += 1; }
      if (ok) this.addPoints(scoringIdx, 1);
      this.log('extra_point', 0, `${k?.name ?? side.team.abbr} extra point is ${ok ? 'good' : 'NO GOOD'}.`, { scoring: ok, noDown: true });
    }
    this.finalizeLastPlayProb();
  }

  touchdown(scorerSideIdx: 0 | 1, how: string) {
    this.addPoints(scorerSideIdx, 6);
    const last = this.plays[this.plays.length - 1];
    if (last) { last.isScoring = true; last.description += ` TOUCHDOWN ${this.sides[scorerSideIdx].team.abbr}!`; }
    this.finalizeLastPlayProb();
    this.endDrive(how);
  }

  // ------------------------------------------------------------- scrimmage plays
  shouldPass(): boolean {
    const scheme = OFF_SCHEME[this.off.team.offenseScheme] ?? OFF_SCHEME.spread;
    let p = scheme.passRate;
    const lead = this.score[this.poss] - this.score[1 - this.poss];
    const late = this.quarter >= 4 && this.clock < 420;
    if (this.down === 3 && this.distance >= 7) p += 0.28;
    if (this.down === 2 && this.distance >= 9) p += 0.1;
    if (this.distance <= 2) p -= 0.22;
    if (late && lead < 0) p += 0.3;
    if (late && lead > 0) p -= 0.28;
    if (this.quarter === 2 && this.clock < 120) p += 0.25;
    return this.rng.chance(clamp(p, 0.08, 0.95));
  }

  hurryUp(): boolean {
    const lead = this.score[this.poss] - this.score[1 - this.poss];
    return (this.quarter === 2 && this.clock < 120) || (this.quarter >= 4 && this.overtime === 0 && this.clock < 300 && lead < 0);
  }

  playClock(kind: 'run' | 'complete' | 'incomplete' | 'sack'): number {
    if (this.overtime > 0) return 0;
    if (kind === 'incomplete') return this.rng.int(5, 8);
    if (this.hurryUp()) return this.rng.int(9, 18);
    const lead = this.score[this.poss] - this.score[1 - this.poss];
    const milking = this.quarter >= 4 && lead > 0;
    return kind === 'sack' ? this.rng.int(26, 36) : this.rng.int(milking ? 34 : 25, milking ? 42 : 38);
  }

  advance(yards: number, kind: 'rush' | 'pass' | 'penalty'): 'td' | 'safety' | 'first' | 'none' {
    this.yardLine += yards;
    if (this.currentDrive) this.currentDrive.yards += yards;
    if (this.yardLine >= 100) {
      this.yardLine = 100;
      return 'td';
    }
    if (this.yardLine <= 0) return 'safety';
    if (yards >= this.distance) {
      this.down = 1;
      this.distance = Math.min(10, 100 - this.yardLine);
      this.teamStats[this.poss].firstDowns += 1;
      return 'first';
    }
    this.down += 1;
    this.distance -= yards;
    return 'none';
  }

  /** Runs one scrimmage play. Returns true if the possession ended. */
  scrimmagePlay(): boolean {
    const off = this.off;
    const def = this.def;
    const offIdx = this.poss;
    const stats = this.teamStats[offIdx];
    const wasThird = this.down === 3;
    if (this.currentDrive) this.currentDrive.plays += 1;
    this.defensivePlaysThisDrive += 1;
    const fatigue = this.defensivePlaysThisDrive > 10 ? 1.5 : 0;

    // Victory formation
    const lead = this.score[offIdx] - this.score[1 - offIdx];
    if (this.quarter === 4 && this.overtime === 0 && lead > 0 && this.yardLine > 3 && this.clock <= 40 * (5 - this.down) && this.clock > 0) {
      const qb = this.player(off, 'QB');
      const st = this.stat(off, qb);
      this.log('kneel', -1, `${qb?.name ?? off.team.abbr} kneels to run out the clock.`);
      if (st) { st.rushAtt += 1; st.rushYds -= 1; }
      stats.rushAtt += 1; stats.rushYards -= 1; stats.totalYards -= 1;
      this.runClock(40);
      this.yardLine -= 1;
      if (this.currentDrive) this.currentDrive.yards -= 1;
      this.down += 1;
      this.finalizeLastPlayProb();
      if (this.clock <= 0) { this.endDrive('End of game'); return true; }
      return false;
    }

    // Pre-snap / live-ball penalties
    if (this.rng.chance(0.055 * this.penFreq)) {
      const onOffense = this.rng.chance(0.55);
      const options = onOffense
        ? [{ n: 'False start', y: -5, w: 0.45 }, { n: 'Holding', y: -10, w: 0.45 }, { n: 'Illegal formation', y: -5, w: 0.1 }]
        : [{ n: 'Offsides', y: 5, w: 0.45 }, { n: 'Pass interference', y: 15, w: 0.3 }, { n: 'Face mask', y: 15, w: 0.1 }, { n: 'Roughing the passer', y: 15, w: 0.15 }];
      const pen = this.rng.weighted(options, (o) => o.w);
      let y = pen.y;
      if (y < 0) y = -Math.min(-y, Math.floor(this.yardLine / 2) || 1);
      if (y > 0) y = Math.min(y, Math.max(1, Math.floor((100 - this.yardLine) / 2)));
      const penalized = onOffense ? offIdx : (1 - offIdx) as 0 | 1;
      this.teamStats[penalized].penalties += 1;
      this.teamStats[penalized].penaltyYards += Math.abs(y);
      const desc = `PENALTY: ${pen.n} on ${this.sides[penalized].team.abbr}, ${Math.abs(y)} yards.`;
      this.log('penalty', y, `${this.downLabel()} — ${desc}`);
      if (this.currentDrive) this.currentDrive.plays -= 1;
      this.yardLine += y;
      if (this.currentDrive) this.currentDrive.yards += y;
      if (!onOffense && (pen.y >= 15 || y >= this.distance)) {
        this.down = 1;
        this.distance = Math.min(10, 100 - this.yardLine);
        stats.firstDowns += 1;
      } else {
        this.distance = Math.min(this.distance - y, 100 - this.yardLine);
        if (this.distance <= 0) { this.down = 1; this.distance = Math.min(10, 100 - this.yardLine); }
      }
      this.runClock(this.overtime ? 0 : this.rng.int(0, 6));
      this.finalizeLastPlayProb();
      return false;
    }

    if (wasThird) stats.thirdDownAtt += 1;
    const pre = this.downLabel();
    let outcome: 'td' | 'safety' | 'first' | 'none' = 'none';
    let turnover = false;

    if (this.shouldPass()) {
      const qb = this.player(off, 'QB');
      const qbSt = this.stat(off, qb);
      const edge = (this.eff(off, 'passOff') - this.eff(def, 'passDef') + fatigue) / EDGE_SCALE;
      // scramble
      if (this.rng.chance(0.025 + off.units.qbSpeed / 2000)) {
        const y = Math.round(clamp(this.rng.normal(5 + edge, 4 * this.variance), -2, 100 - this.yardLine));
        if (qbSt) { qbSt.rushAtt += 1; qbSt.rushYds += y; }
        stats.rushAtt += 1; stats.rushYards += y; stats.totalYards += y;
        this.log('run', y, `${pre} — ${qb?.name} scrambles for ${y} yard${Math.abs(y) === 1 ? '' : 's'}.`);
        const t = this.tackler(def, 'run');
        outcome = this.advance(y, 'rush');
        if (outcome === 'td') { if (qbSt) qbSt.rushTd += 1; } else { const ts = this.stat(def, t); if (ts) ts.tackles += 1; }
        this.runClock(this.playClock('run'));
      } else if (this.rng.chance(clamp(0.065 * (1 - 0.18 * edge) * Math.sqrt(this.defEff), 0.02, 0.15))) {
        // sack
        const y = -Math.round(clamp(this.rng.normal(7, 2.2), 1, Math.min(15, this.yardLine)));
        const sacker = this.rng.chance(0.72) ? this.player(def, 'DL', this.rng.int(0, 3)) : this.player(def, 'LB', this.rng.int(0, 2));
        const sk = this.stat(def, sacker);
        if (sk) { sk.sacks += 1; sk.tackles += 1; sk.tfl += 1; }
        this.teamStats[1 - offIdx].sacks += 1;
        if (qbSt) { qbSt.rushAtt += 1; qbSt.rushYds += y; }
        stats.rushAtt += 1; stats.rushYards += y; stats.totalYards += y;
        const fumble = this.rng.chance(0.07 * this.toFreq);
        if (fumble && this.rng.chance(0.55)) {
          if (sk) sk.forcedFumbles += 1;
          this.log('fumble', y, `${pre} — ${qb?.name} SACKED by ${sacker?.name} and FUMBLES! Recovered by ${def.team.abbr}.`, { turnover: true });
          stats.turnovers += 1;
          this.yardLine = Math.max(1, this.yardLine + y);
          if (this.currentDrive) this.currentDrive.yards += y;
          turnover = true;
        } else {
          this.log('sack', y, `${pre} — ${qb?.name} sacked by ${sacker?.name} for a loss of ${-y}.`);
          outcome = this.advance(y, 'rush');
        }
        this.runClock(this.playClock('sack'));
      } else {
        const scheme = OFF_SCHEME[off.team.offenseScheme] ?? OFF_SCHEME.spread;
        const r = this.rng.next();
        const depth = r < 0.55 - scheme.deep ? 'short' : r < 0.87 - scheme.deep ? 'medium' : 'deep';
        const targets: [Position, number, number][] = [
          ['WR', 0, 0.3], ['WR', 1, 0.22], ['WR', 2, 0.15], ['TE', 0, 0.15], ['RB', 0, 0.12], ['WR', 3, 0.06],
        ];
        const tgt = this.rng.weighted(targets, (t) => t[2] * (depth === 'deep' && t[0] !== 'WR' ? 0.3 : 1));
        const receiver = this.player(off, tgt[0], tgt[1]) ?? this.player(off, 'WR');
        const intP = clamp(0.024 * this.toFreq * (1 - 0.15 * edge) * (depth === 'short' ? 0.7 : depth === 'medium' ? 1.1 : 1.6), 0.003, 0.08);
        if (qbSt) qbSt.passAtt += 1;
        stats.passAtt += 1;
        if (this.rng.chance(intP)) {
          const dbPos: Position = this.rng.chance(0.6) ? 'CB' : this.rng.chance(0.7) ? 'S' : 'LB';
          const db = this.player(def, dbPos, this.rng.int(0, 1));
          const dbs = this.stat(def, db);
          if (dbs) dbs.defInt += 1;
          if (qbSt) qbSt.passInt += 1;
          stats.turnovers += 1;
          const airYards = depth === 'short' ? 5 : depth === 'medium' ? 14 : 30;
          const spot = clamp(this.yardLine + airYards, 1, 99);
          const pick6 = this.overtime === 0 && this.rng.chance(0.06);
          this.log('interception', 0, `${pre} — ${qb?.name} pass intended for ${receiver?.name} is INTERCEPTED by ${db?.name}${pick6 ? ' and returned for a TOUCHDOWN!' : '.'}`, { turnover: true });
          this.runClock(this.playClock('complete'));
          if (pick6) {
            this.endDrive('Interception');
            this.finalizeLastPlayProb();
            const dIdx = (1 - offIdx) as 0 | 1;
            this.poss = dIdx;
            this.addPoints(dIdx, 6);
            this.plays[this.plays.length - 1].isScoring = true;
            this.finalizeLastPlayProb();
            this.pointAfter(dIdx);
            this.kickoff(dIdx, { onsideOk: true });
            return true;
          }
          this.yardLine = spot;
          turnover = true;
        } else {
          const baseCmp = depth === 'short' ? 0.74 : depth === 'medium' ? 0.56 : 0.37;
          const wcBonus = off.team.offenseScheme === 'west_coast' && depth === 'short' ? 0.04 : 0;
          const redZone = this.yardLine >= 82 ? 0.06 : 0;
          const cmpP = clamp(baseCmp + 0.045 * edge + wcBonus - (this.defEff - 1) * 0.05 - redZone, 0.15, 0.9);
          if (this.rng.chance(cmpP)) {
            const air = depth === 'short' ? this.rng.normal(5, 2.5) : depth === 'medium' ? this.rng.normal(12.5, 3.5) : this.rng.normal(29, 8);
            let yac = Math.max(0, this.rng.normal(3 + edge * 0.6, 2.5 * this.variance));
            if (this.rng.chance(0.045 * this.explosive)) yac += this.rng.range(8, 45);
            const y = Math.round(clamp(air + yac, -3, 100 - this.yardLine));
            const rs = this.stat(off, receiver);
            if (rs) { rs.rec += 1; rs.recYds += y; }
            if (qbSt) { qbSt.passCmp += 1; qbSt.passYds += y; }
            stats.passCmp += 1; stats.passYards += y; stats.totalYards += y;
            this.log('pass', y, `${pre} — ${qb?.name} pass complete to ${receiver?.name} for ${y} yard${Math.abs(y) === 1 ? '' : 's'}.`);
            outcome = this.advance(y, 'pass');
            if (outcome === 'td') {
              if (rs) rs.recTd += 1;
              if (qbSt) qbSt.passTd += 1;
            } else {
              const t = this.tackler(def, depth === 'deep' ? 'deep' : 'pass');
              const ts = this.stat(def, t);
              if (ts) ts.tackles += 1;
              // fumble after catch
              if (this.rng.chance(0.006 * this.toFreq)) {
                if (ts) ts.forcedFumbles += 1;
                this.plays[this.plays.length - 1].description += ` FUMBLE forced by ${t?.name}, recovered by ${def.team.abbr}!`;
                this.plays[this.plays.length - 1].isTurnover = true;
                stats.turnovers += 1;
                turnover = true;
              }
              this.maybeInjure(off, receiver);
            }
            this.runClock(this.playClock('complete'));
          } else {
            this.log('incomplete', 0, `${pre} — ${qb?.name} pass incomplete${receiver ? ` intended for ${receiver.name}` : ''}.`);
            outcome = this.advance(0, 'pass');
            this.runClock(this.playClock('incomplete'));
          }
        }
      }
    } else {
      // designed run
      const rb1 = this.player(off, 'RB', 0);
      const carries = rb1 ? off.rbCarries.get(rb1.id) ?? 0 : 0;
      const useBackup = this.rng.chance(carries > 18 ? 0.45 : 0.22);
      const qbKeep = (off.team.offenseScheme === 'option' || off.team.offenseScheme === 'rpo') && this.rng.chance(0.25);
      const carrier = qbKeep ? this.player(off, 'QB') : useBackup ? this.player(off, 'RB', 1) ?? rb1 : rb1;
      if (carrier && carrier.position === 'RB') off.rbCarries.set(carrier.id, (off.rbCarries.get(carrier.id) ?? 0) + 1);
      const tired = carries > 22 ? -0.4 : 0;
      const edge = (this.eff(off, 'rushOff') - this.eff(def, 'rushDef') + fatigue) / EDGE_SCALE + tired;
      let y = Math.round(this.rng.normal(4.0 + 0.9 * edge - (this.defEff - 1) * 0.9 - (this.yardLine >= 85 ? 1.0 : 0), 3.4 * this.variance));
      y = Math.max(y, -4);
      if (this.rng.chance(clamp(0.034 * this.explosive * (1 + 0.25 * edge), 0.003, 0.12))) y += Math.round(this.rng.range(10, 60));
      if (this.distance <= 1 && this.rng.chance(0.5 + 0.08 * edge)) y = Math.max(y, 1);
      y = Math.min(y, 100 - this.yardLine);
      const cs = this.stat(off, carrier);
      if (cs) { cs.rushAtt += 1; cs.rushYds += y; }
      stats.rushAtt += 1; stats.rushYards += y; stats.totalYards += y;
      const fumble = this.rng.chance(0.011 * this.toFreq) && this.rng.chance(0.55) && y < 100 - this.yardLine;
      const t = this.tackler(def, 'run');
      const ts = this.stat(def, t);
      if (fumble) {
        if (ts) { ts.tackles += 1; ts.forcedFumbles += 1; }
        this.log('fumble', y, `${pre} — ${carrier?.name} runs for ${y}, FUMBLES! Forced by ${t?.name}, recovered by ${def.team.abbr}.`, { turnover: true });
        stats.turnovers += 1;
        this.yardLine = clamp(this.yardLine + y, 1, 99);
        if (this.currentDrive) this.currentDrive.yards += y;
        turnover = true;
      } else {
        const verb = y < 0 ? `is stopped for a loss of ${-y}` : y === 0 ? 'is stopped for no gain' : `runs for ${y} yard${y === 1 ? '' : 's'}`;
        this.log('run', y, `${pre} — ${carrier?.name} ${verb}.`);
        outcome = this.advance(y, 'rush');
        if (outcome === 'td') { if (cs) cs.rushTd += 1; } else if (ts) {
          ts.tackles += 1;
          if (y < 0) ts.tfl += 1;
        }
        this.maybeInjure(off, carrier);
      }
      this.runClock(this.playClock('run'));
    }

    if (wasThird && (outcome === 'first' || outcome === 'td')) stats.thirdDownConv += 1;

    if (turnover) {
      this.endDrive(this.plays[this.plays.length - 1].playType === 'interception' ? 'Interception' : 'Fumble');
      this.finalizeLastPlayProb();
      const newYard = 100 - this.yardLine;
      if (this.overtime > 0) return true;
      this.startDrive((1 - offIdx) as 0 | 1, clamp(newYard, 1, 99));
      return true;
    }
    if (outcome === 'td') {
      this.touchdown(offIdx, 'Touchdown');
      if (this.overtime > 0) return true;
      this.pointAfter(offIdx);
      if (this.clock > 0 || this.quarter === 1 || this.quarter === 3) this.kickoff(offIdx, { onsideOk: true });
      return true;
    }
    if (outcome === 'safety') {
      this.yardLine = 0;
      this.addPoints((1 - offIdx) as 0 | 1, 2);
      const last = this.plays[this.plays.length - 1];
      last.description += ` SAFETY ${def.team.abbr}!`;
      last.isScoring = true;
      this.finalizeLastPlayProb();
      this.endDrive('Safety');
      // free kick from the 20
      this.poss = offIdx;
      this.log('kickoff', 0, `${off.team.abbr} free kick after the safety.`, { noDown: true });
      this.finalizeLastPlayProb();
      this.startDrive((1 - offIdx) as 0 | 1, 40);
      return true;
    }
    this.finalizeLastPlayProb();
    if (this.down > 4) {
      // turnover on downs
      this.plays[this.plays.length - 1].description += ` Turnover on downs.`;
      this.plays[this.plays.length - 1].isTurnover = true;
      this.endDrive('Downs');
      if (this.overtime > 0) return true;
      this.startDrive((1 - offIdx) as 0 | 1, 100 - this.yardLine);
      return true;
    }
    return false;
  }

  fourthDownDecision(): 'go' | 'fg' | 'punt' {
    const lead = this.score[this.poss] - this.score[1 - this.poss];
    const fgDist = 100 - this.yardLine + 17;
    const range = 44 + this.off.units.kickPower / 9;
    const aggression = 0.3 + (this.off.team.coachRating - 60) / 120;
    if (this.overtime > 0) {
      if (this.overtime >= 2 && lead < 0) return 'go';
      if (lead < -3 || (lead < 0 && fgDist > range)) return 'go';
      return fgDist <= range + 3 ? 'fg' : 'go';
    }
    const late = this.quarter === 4 && this.clock < 300;
    if (late && lead < 0 && (lead < -3 || this.clock < 90)) {
      if (lead >= -3 && fgDist <= range) return 'fg';
      return 'go';
    }
    if (this.quarter === 2 && this.clock < 20 && fgDist <= range + 2) return 'fg';
    if (fgDist <= range) {
      if (this.distance <= 1 && this.yardLine >= 92 && this.rng.chance(aggression)) return 'go';
      return 'fg';
    }
    if (this.distance <= 2 && this.yardLine >= 45 && this.rng.chance(aggression)) return 'go';
    if (this.distance <= 1 && this.yardLine >= 35 && this.rng.chance(aggression * 0.6)) return 'go';
    return 'punt';
  }

  fieldGoal(): boolean {
    const off = this.off;
    const offIdx = this.poss;
    const dist = 100 - this.yardLine + 17;
    const k = this.player(off, 'K');
    const st = this.stat(off, k);
    const p = clamp(1 / (1 + Math.exp((dist - 52) / 6)) + (off.units.kickAccuracy - 75) / 220, 0.03, 0.995);
    const good = this.rng.chance(p);
    if (st) { st.fga += 1; if (good) st.fgm += 1; }
    if (this.currentDrive) this.currentDrive.plays += 1;
    this.log('field_goal', 0, `${this.downLabel()} — ${k?.name ?? off.team.abbr} ${dist}-yard field goal attempt is ${good ? 'GOOD' : 'NO GOOD'}.`, { scoring: good });
    this.runClock(this.overtime ? 0 : this.rng.int(4, 6));
    if (good) {
      this.addPoints(offIdx, 3);
      this.finalizeLastPlayProb();
      this.endDrive('Field goal');
      if (this.overtime > 0) return true;
      if (this.clock > 0 || this.quarter === 1 || this.quarter === 3) this.kickoff(offIdx, { onsideOk: true });
    } else {
      this.finalizeLastPlayProb();
      this.endDrive('Missed FG');
      if (this.overtime > 0) return true;
      const spot = Math.max(20, 100 - (this.yardLine - 7));
      this.startDrive((1 - offIdx) as 0 | 1, Math.min(spot, 80));
    }
    return true;
  }

  punt(): boolean {
    const off = this.off;
    const def = this.def;
    const offIdx = this.poss;
    const punter = this.player(off, 'P') ?? this.player(off, 'K');
    const st = this.stat(off, punter);
    if (this.currentDrive) this.currentDrive.plays += 1;
    if (this.rng.chance(0.005)) {
      this.log('punt', 0, `${this.downLabel()} — Punt BLOCKED! ${def.team.abbr} takes over.`, { turnover: true });
      this.runClock(5);
      this.finalizeLastPlayProb();
      this.endDrive('Blocked punt');
      this.startDrive((1 - offIdx) as 0 | 1, clamp(100 - this.yardLine + 7, 1, 99));
      return true;
    }
    const gross = Math.round(clamp(this.rng.normal(41 + (off.units.puntPower - 70) / 5, 6), 22, 65));
    let land = this.yardLine + gross;
    let desc: string;
    let recvStart: number;
    if (land >= 100) {
      recvStart = 20;
      desc = `${punter?.name ?? off.team.abbr} punts ${gross} yards into the end zone. Touchback.`;
      land = 100;
    } else {
      const returner = this.player(def, this.rng.chance(0.6) ? 'WR' : 'CB', 1) ?? this.player(def, 'WR');
      if (this.rng.chance(0.45) || land > 95) {
        recvStart = 100 - land;
        desc = `${punter?.name ?? off.team.abbr} punts ${gross} yards. Fair catch by ${returner?.name ?? def.team.abbr}.`;
      } else {
        const rs = this.stat(def, returner);
        if (this.rng.chance(0.007 * this.explosive)) {
          const retY = 100 - (100 - land);
          if (rs) { rs.pr += 1; rs.prYds += retY; }
          if (st) { st.punts += 1; st.puntYds += gross; }
          this.log('punt', gross, `${this.downLabel()} — ${punter?.name} punts ${gross} yards. ${returner?.name} returns it ${retY} yards for a TOUCHDOWN!`, { scoring: true });
          this.runClock(12);
          this.endDrive('Punt');
          const dIdx = (1 - offIdx) as 0 | 1;
          this.poss = dIdx;
          this.addPoints(dIdx, 6);
          this.finalizeLastPlayProb();
          this.pointAfter(dIdx);
          this.kickoff(dIdx, { onsideOk: true });
          return true;
        }
        const ret = Math.round(clamp(this.rng.normal(8, 6 * this.variance), -3, 40));
        if (rs) { rs.pr += 1; rs.prYds += ret; }
        recvStart = clamp(100 - land + ret, 1, 99);
        desc = `${punter?.name ?? off.team.abbr} punts ${gross} yards, returned ${ret} yards by ${returner?.name}.`;
      }
    }
    if (st) { st.punts += 1; st.puntYds += gross; }
    this.log('punt', gross, `${this.downLabel()} — ${desc}`);
    this.runClock(this.rng.int(6, 10));
    this.finalizeLastPlayProb();
    this.endDrive('Punt');
    this.startDrive((1 - offIdx) as 0 | 1, recvStart);
    return true;
  }

  /** Runs plays until the current possession ends or the quarter clock expires */
  runPossession() {
    let guard = 0;
    while (guard++ < 60) {
      if (this.overtime === 0 && this.clock <= 0) return;
      if (this.down === 4) {
        const d = this.fourthDownDecision();
        if (d === 'fg') { this.fieldGoal(); return; }
        if (d === 'punt') { this.punt(); return; }
      }
      const ended = this.scrimmagePlay();
      if (ended) return;
    }
    this.endDrive('End of possession');
  }

  quarterBreak() {
    const q = this.quarter;
    this.log('end_quarter', 0, q === 2 ? 'End of first half.' : q === 4 ? 'End of regulation.' : `End of quarter ${q}.`, { noDown: true });
    this.finalizeLastPlayProb();
  }

  playRegulation() {
    this.openingReceiver = this.rng.chance(0.5) ? 0 : 1;
    this.kickoff((1 - this.openingReceiver) as 0 | 1);
    let guard = 0;
    while (this.quarter <= 4 && guard++ < 400) {
      if (this.clock <= 0) {
        this.quarterBreak();
        if (this.quarter === 2 || this.quarter === 4) this.endDrive(this.quarter === 2 ? 'End of half' : 'End of game');
        this.quarter += 1;
        this.clock = QUARTER_SECONDS;
        if (this.quarter === 3) {
          this.kickoff(this.openingReceiver);
        }
        continue;
      }
      // If the previous possession ended with the clock expired mid-change, ensure a drive exists
      if (!this.currentDrive || this.currentDrive.result !== 'In progress') {
        this.startDrive(this.poss, 25);
      }
      this.runPossession();
    }
    this.quarter = 4;
    this.clock = 0;
  }

  playOvertime() {
    let first: 0 | 1 = this.rng.chance(0.5) ? 0 : 1;
    while (this.score[0] === this.score[1] && this.overtime < 12) {
      this.overtime += 1;
      this.quarter = 4 + this.overtime;
      this.clock = 0;
      this.teamStats[0].quarters.push(0);
      this.teamStats[1].quarters.push(0);
      this.log('end_quarter', 0, `Overtime period ${this.overtime} begins.`, { noDown: true });
      this.finalizeLastPlayProb();
      for (const idx of [first, (1 - first) as 0 | 1]) {
        if (this.overtime >= 3) {
          // alternating two-point plays
          this.poss = idx;
          this.yardLine = 97;
          this.down = 1;
          this.distance = 3;
          const side = this.sides[idx];
          const edge = (this.eff(side, 'passOff') - this.eff(this.sides[1 - idx], 'passDef')) / 12;
          const ok = this.rng.chance(clamp(0.46 + 0.05 * edge, 0.25, 0.7));
          if (ok) this.addPoints(idx, 2);
          this.log('two_point', 0, `OT two-point attempt by ${side.team.abbr} is ${ok ? 'GOOD' : 'no good'}.`, { scoring: ok, noDown: true });
          this.finalizeLastPlayProb();
        } else {
          this.startDrive(idx, 75);
          this.runPossession();
          const last = this.plays[this.plays.length - 1];
          if (last?.isScoring && this.currentDrive?.result === 'Touchdown') {
            this.pointAfter(idx, this.overtime >= 2);
          }
        }
      }
      first = (1 - first) as 0 | 1;
    }
    if (this.score[0] === this.score[1]) {
      // Safety valve — should be astronomically rare after 12 periods
      const idx: 0 | 1 = this.rng.chance(0.5) ? 0 : 1;
      this.addPoints(idx, 2);
      this.log('two_point', 0, `${this.sides[idx].team.abbr} converts the decisive two-point attempt.`, { scoring: true, noDown: true });
      this.finalizeLastPlayProb();
    }
  }

  run(): GameResult {
    this.playRegulation();
    if (this.score[0] === this.score[1]) this.playOvertime();
    this.endDrive('End of game');
    const last = this.plays[this.plays.length - 1];
    if (last) last.homeWinProb = this.score[0] > this.score[1] ? 1 : 0;
    this.log('end_quarter', 0, `FINAL: ${this.sides[0].team.abbr} ${this.score[0]}, ${this.sides[1].team.abbr} ${this.score[1]}${this.overtime ? ` (${this.overtime > 1 ? `${this.overtime}OT` : 'OT'})` : ''}`, { noDown: true });
    this.plays[this.plays.length - 1].homeWinProb = this.score[0] > this.score[1] ? 1 : 0;

    // Normalize team yards (total = pass + rush) and drop zero-stat lines
    for (const t of this.teamStats) t.totalYards = t.passYards + t.rushYards;
    const playerStats = [...this.playerStats.values()];

    const homeWon = this.score[0] > this.score[1];
    const winnerIdx = homeWon ? 0 : 1;
    const pregameHomeWinProb = pregameWinProbability(this.pregameMargin, this.s);
    const winnerPregame = homeWon ? pregameHomeWinProb : 1 - pregameHomeWinProb;
    const tags: string[] = [];
    if (winnerPregame < 0.35) tags.push('upset');
    if (this.score[0] >= 38 && this.score[1] >= 38) tags.push('shootout');
    if (this.score[0] + this.score[1] <= 27) tags.push('defensive battle');
    if (this.maxDeficit[winnerIdx] >= 14) tags.push('comeback');
    if (this.overtime > 0) tags.push('overtime');
    if (Math.abs(this.score[0] - this.score[1]) >= 28) tags.push('blowout');

    return {
      seed: this.input.seed,
      homeTeamId: this.input.home.id,
      awayTeamId: this.input.away.id,
      homeScore: this.score[0],
      awayScore: this.score[1],
      overtimes: this.overtime,
      winnerTeamId: this.sides[winnerIdx].team.id,
      plays: this.plays,
      drives: this.drives.filter((d) => d.plays > 0 || d.points > 0),
      teamStats: { home: this.teamStats[0], away: this.teamStats[1] },
      playerStats,
      injuries: this.injuries,
      pregameHomeWinProb,
      tags,
      maxComeback: this.maxDeficit[winnerIdx],
    };
  }
}

export function simulateGame(input: SimInput): GameResult {
  return new GameSim(input).run();
}
