/**
 * Recruiting decision engine.
 *
 * Owners never touch interest, ratings or decisions directly: they submit
 * actions that cost recruiting points, and this engine (run server-side, once
 * per week, with a reproducible seed) turns actions + school fit into interest
 * changes and commitment decisions. Recruits weigh prestige, playing time,
 * coaching, recent success, title contention, distance from home, scheme fit,
 * campus visits and relationship strength according to their own priorities.
 */
import { clamp, createRng, type Rng } from '../rng';
import { schemeFitsPosition, OFFENSE_POSITIONS, type Position } from '../players/positions';

export const PRIORITY_KEYS = [
  'prestige', 'playingTime', 'coach', 'success', 'championship', 'proximity', 'scheme', 'visits', 'relationship',
] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];
export type Priorities = Record<PriorityKey, number>;

export const PRIORITY_LABELS: Record<PriorityKey, string> = {
  prestige: 'Program prestige', playingTime: 'Playing time', coach: 'Coaching reputation', success: 'Recent success',
  championship: 'Championship contender', proximity: 'Close to home', scheme: 'Scheme fit', visits: 'Campus visit',
  relationship: 'Relationship with staff',
};

export type ActionType = 'scout' | 'contact' | 'offer' | 'visit' | 'pitch' | 'pull_offer';

export interface RecruitingRules {
  weeklyPoints: number;
  scholarshipLimit: number;
  maxActiveOffers: number;
  costs: Record<ActionType, number>;
  maxVisitsPerWeek: number;
  requireApproval: boolean;
  signingDayWeek: number;
  commitThreshold: number;
  flipMargin: number;
  rosterLimit: number;
}

export const DEFAULT_RULES: RecruitingRules = {
  weeklyPoints: 100, scholarshipLimit: 25, maxActiveOffers: 35,
  costs: { scout: 5, contact: 10, offer: 0, visit: 25, pitch: 15, pull_offer: 0 },
  maxVisitsPerWeek: 4, requireApproval: false, signingDayWeek: 16, commitThreshold: 64, flipMargin: 16, rosterLimit: 85,
};

export interface RecruitState {
  id: string;
  position: Position;
  stars: number;
  overall: number;
  potential: number;
  latitude: number | null;
  longitude: number | null;
  preferredScheme: string | null;
  priorities: Priorities;
  status: 'uncommitted' | 'committed' | 'signed' | 'withdrawn';
  committedTeamId: string | null;
  isTransfer: boolean;
  fromTeamId: string | null;
}

export interface InterestState {
  recruitId: string;
  teamId: string;
  interest: number;
  relationship: number;
  scouted: boolean;
  offered: boolean;
  offeredWeek: number | null;
  visited: boolean;
  visitWeek: number | null;
  pitches: number;
  lastActionWeek: number | null;
}

export interface TeamContext {
  id: string;
  prestige: number;
  coachRating: number;
  latitude: number | null;
  longitude: number | null;
  offenseScheme: string;
  defenseScheme: string;
  recentWinPct: number; // 0-1
  powerRank: number; // 1 = best
  bestAtPosition: Partial<Record<Position, number>>; // top returning overall per position
  commits: number; // current committed + signed for this class
  isAi: boolean;
  /** How many signees a computer-controlled program needs to keep its roster healthy */
  aiTarget?: number;
}

export interface WeekAction {
  id?: string;
  teamId: string;
  recruitId: string;
  type: ActionType;
  pitchAngle?: PriorityKey | null;
}

export interface CommitmentEvent {
  recruitId: string;
  teamId: string;
  previousTeamId: string | null;
  event: 'commit' | 'decommit' | 'flip' | 'signed';
}

export function distanceMiles(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 800;
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** How a school scores (0-1) on each factor this recruit cares about */
export function factorScores(r: RecruitState, t: TeamContext, i?: Pick<InterestState, 'visited' | 'relationship'>, totalTeams = 138): Record<PriorityKey, number> {
  const best = t.bestAtPosition[r.position] ?? 50;
  const scheme = OFFENSE_POSITIONS.includes(r.position) ? t.offenseScheme : t.defenseScheme;
  const schemeScore = r.preferredScheme
    ? r.preferredScheme === scheme ? 1 : 0.35
    : clamp(0.5 + schemeFitsPosition(scheme, r.position) * 0.4, 0, 1);
  return {
    prestige: t.prestige / 100,
    playingTime: 1 - clamp((best - r.overall + 8) / 30, 0, 1),
    coach: clamp((t.coachRating - 40) / 59, 0, 1),
    success: clamp(t.recentWinPct, 0, 1),
    championship: 1 - clamp((t.powerRank - 1) / Math.max(1, totalTeams - 1), 0, 1),
    proximity: 1 - clamp(distanceMiles(r.latitude, r.longitude, t.latitude, t.longitude) / 1400, 0, 1),
    scheme: schemeScore,
    visits: i?.visited ? 1 : 0,
    relationship: clamp((i?.relationship ?? 0) / 100, 0, 1),
  };
}

export function fitScore(r: RecruitState, t: TeamContext, i?: Pick<InterestState, 'visited' | 'relationship'>, totalTeams = 138): number {
  const f = factorScores(r, t, i, totalTeams);
  let s = 0;
  let w = 0;
  for (const k of PRIORITY_KEYS) { s += r.priorities[k] * f[k]; w += r.priorities[k]; }
  return w ? s / w : 0.5;
}

export function topPriorities(p: Priorities, n = 3): PriorityKey[] {
  return [...PRIORITY_KEYS].sort((a, b) => p[b] - p[a]).slice(0, n);
}

export function randomPriorities(rng: Rng, stars: number): Priorities {
  const base: Priorities = {
    prestige: rng.range(0.4, 1) * (stars >= 4 ? 1.3 : 1),
    playingTime: rng.range(0.3, 1),
    coach: rng.range(0.2, 0.9),
    success: rng.range(0.2, 0.9),
    championship: rng.range(0.1, 0.9) * (stars >= 4 ? 1.4 : 0.8),
    proximity: rng.range(0.1, 1),
    scheme: rng.range(0.2, 0.9),
    visits: rng.range(0.2, 0.8),
    relationship: rng.range(0.3, 0.9),
  };
  // one dominant priority makes recruits distinct
  const dom = rng.pick(PRIORITY_KEYS);
  base[dom] *= 1.8;
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  for (const k of PRIORITY_KEYS) base[k] = +(base[k] / total).toFixed(4);
  return base;
}

export function newInterest(recruitId: string, teamId: string): InterestState {
  return {
    recruitId, teamId, interest: 0, relationship: 0, scouted: false, offered: false, offeredWeek: null,
    visited: false, visitWeek: null, pitches: 0, lastActionWeek: null,
  };
}

export interface ProcessInput {
  recruits: RecruitState[];
  interests: InterestState[];
  teams: TeamContext[];
  actions: WeekAction[];
  rules: RecruitingRules;
  week: number;
  seed: string;
  signingDay: boolean;
}

export interface ProcessOutput {
  interests: InterestState[]; // every changed or created interest row
  events: CommitmentEvent[];
  actionNotes: Map<number, string>; // index in input.actions -> result note
  recruitUpdates: { id: string; status: RecruitState['status']; committedTeamId: string | null }[];
}

export function processRecruitingWeek(input: ProcessInput): ProcessOutput {
  const rng = createRng(`${input.seed}-recruiting-w${input.week}`);
  const teams = new Map(input.teams.map((t) => [t.id, t]));
  const recruits = new Map(input.recruits.map((r) => [r.id, { ...r }]));
  const key = (r: string, t: string) => `${r}|${t}`;
  const interests = new Map(input.interests.map((i) => [key(i.recruitId, i.teamId), { ...i }]));
  const changed = new Set<string>();
  const notes = new Map<number, string>();
  const commits = new Map(input.teams.map((t) => [t.id, t.commits]));
  const totalTeams = Math.max(input.teams.length, 2);

  const getI = (rid: string, tid: string) => {
    const k = key(rid, tid);
    let i = interests.get(k);
    if (!i) { i = newInterest(rid, tid); interests.set(k, i); }
    changed.add(k);
    return i;
  };
  const bump = (i: InterestState, delta: number, r: RecruitState, t: TeamContext) => {
    const fit = fitScore(r, t, i, totalTeams);
    let d = delta * (0.45 + fit * 1.1);
    if (d > 0) d *= 1 - i.interest / 125; // diminishing returns
    d += rng.normal(0, Math.abs(delta) * 0.15);
    i.interest = clamp(i.interest + d, 0, 100);
  };

  // 1. Apply actions
  input.actions.forEach((a, idx) => {
    const r = recruits.get(a.recruitId);
    const t = teams.get(a.teamId);
    if (!r || !t) { notes.set(idx, 'Invalid recruit or team'); return; }
    if (r.status === 'signed' || r.status === 'withdrawn') { notes.set(idx, 'Recruit is no longer available'); return; }
    const i = getI(r.id, t.id);
    i.lastActionWeek = input.week;
    switch (a.type) {
      case 'scout':
        i.scouted = true;
        bump(i, 1, r, t);
        notes.set(idx, 'Scouting report unlocked');
        break;
      case 'contact':
        i.relationship = clamp(i.relationship + 5 + rng.range(0, 3), 0, 100);
        bump(i, 4, r, t);
        notes.set(idx, 'Contact made');
        break;
      case 'offer':
        if (i.offered) { notes.set(idx, 'Already offered'); break; }
        i.offered = true;
        i.offeredWeek = input.week;
        bump(i, 9, r, t);
        notes.set(idx, 'Scholarship offered');
        break;
      case 'pull_offer':
        i.offered = false;
        i.interest = clamp(i.interest - 15, 0, 100);
        i.relationship = clamp(i.relationship - 10, 0, 100);
        notes.set(idx, 'Offer pulled');
        break;
      case 'visit':
        if (!i.offered) { notes.set(idx, 'Visit requires an active offer'); break; }
        if (i.visited) { notes.set(idx, 'Already visited campus'); break; }
        i.visited = true;
        i.visitWeek = input.week;
        i.relationship = clamp(i.relationship + 6, 0, 100);
        bump(i, 7 + 10 * r.priorities.visits * 9, r, t);
        notes.set(idx, 'Official visit completed');
        break;
      case 'pitch': {
        const angle = a.pitchAngle && PRIORITY_KEYS.includes(a.pitchAngle) ? a.pitchAngle : 'prestige';
        const f = factorScores(r, t, i, totalTeams)[angle];
        const weight = r.priorities[angle] * PRIORITY_KEYS.length; // ~1 = average priority
        const effect = 4 * (1 + weight * (f - 0.45) * 2.2);
        i.pitches += 1;
        i.relationship = clamp(i.relationship + 2, 0, 100);
        bump(i, effect, r, t);
        notes.set(idx, effect >= 6 ? 'Pitch resonated strongly' : effect >= 3 ? 'Pitch was well received' : 'Pitch fell flat');
        break;
      }
    }
  });

  // 2. Passive drift toward natural fit for every school already in the picture
  for (const [k, i] of interests) {
    const r = recruits.get(i.recruitId);
    const t = teams.get(i.teamId);
    if (!r || !t || r.status === 'signed') continue;
    const target = fitScore(r, t, i, totalTeams) * (i.offered ? 70 : 45);
    const before = i.interest;
    i.interest = clamp(i.interest + (target - i.interest) * 0.035, 0, 100);
    if (i.lastActionWeek !== null && input.week - i.lastActionWeek > 2) i.relationship = clamp(i.relationship - 1, 0, 100);
    if (Math.abs(before - i.interest) > 0.01) changed.add(k);
  }

  // 3. Decisions
  const events: CommitmentEvent[] = [];
  const byRecruit = new Map<string, InterestState[]>();
  for (const i of interests.values()) byRecruit.set(i.recruitId, [...(byRecruit.get(i.recruitId) ?? []), i]);
  const hasRoom = (tid: string) => (commits.get(tid) ?? 0) < input.rules.scholarshipLimit;

  for (const r of [...recruits.values()].sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))) {
    if (r.status === 'signed' || r.status === 'withdrawn') continue;
    const offers = (byRecruit.get(r.id) ?? []).filter((i) => i.offered).sort((a, b) => b.interest - a.interest);
    const current = r.committedTeamId ? interests.get(key(r.id, r.committedTeamId)) : undefined;

    if (r.status === 'committed' && r.committedTeamId) {
      if (!current || !current.offered) {
        events.push({ recruitId: r.id, teamId: r.committedTeamId, previousTeamId: null, event: 'decommit' });
        commits.set(r.committedTeamId, (commits.get(r.committedTeamId) ?? 1) - 1);
        r.status = 'uncommitted';
        r.committedTeamId = null;
      } else {
        const rival = offers.find((o) => o.teamId !== r.committedTeamId && hasRoom(o.teamId));
        if (rival && rival.interest - current.interest >= input.rules.flipMargin && rng.chance(0.3)) {
          events.push({ recruitId: r.id, teamId: rival.teamId, previousTeamId: r.committedTeamId, event: 'flip' });
          commits.set(r.committedTeamId, (commits.get(r.committedTeamId) ?? 1) - 1);
          commits.set(rival.teamId, (commits.get(rival.teamId) ?? 0) + 1);
          r.committedTeamId = rival.teamId;
        } else if (current.interest < input.rules.commitThreshold - 25 && rng.chance(0.25)) {
          events.push({ recruitId: r.id, teamId: r.committedTeamId, previousTeamId: null, event: 'decommit' });
          commits.set(r.committedTeamId, (commits.get(r.committedTeamId) ?? 1) - 1);
          r.status = 'uncommitted';
          r.committedTeamId = null;
        }
      }
    }

    if (r.status === 'uncommitted') {
      const eligible = offers.filter((o) => hasRoom(o.teamId));
      const top = eligible[0];
      if (top) {
        const second = eligible[1]?.interest ?? 0;
        const lead = top.interest - second;
        // transfers decide quickly; elite high-school prospects take longer
        const threshold = r.isTransfer ? input.rules.commitThreshold - 22 : input.rules.commitThreshold + (r.stars - 3) * 3;
        let p = 0;
        if (top.interest >= threshold && lead >= 5) p = clamp(0.3 + (top.interest - threshold) / 40 + lead / 60, 0, 0.9);
        if (input.signingDay) p = 1;
        if (p > 0 && rng.chance(p)) {
          events.push({ recruitId: r.id, teamId: top.teamId, previousTeamId: null, event: 'commit' });
          commits.set(top.teamId, (commits.get(top.teamId) ?? 0) + 1);
          r.status = 'committed';
          r.committedTeamId = top.teamId;
        }
      }
    }

    if (input.signingDay && r.status === 'committed' && r.committedTeamId) {
      events.push({ recruitId: r.id, teamId: r.committedTeamId, previousTeamId: null, event: 'signed' });
      r.status = 'signed';
    }
  }

  // Signing day: computer-controlled programs fill their remaining needs with the best available
  // uncommitted prospects that fit them (owners must recruit their own classes).
  if (input.signingDay) {
    const aiTeams = input.teams.filter((t) => t.isAi);
    const need = new Map(aiTeams.map((t) => [t.id, Math.min(input.rules.scholarshipLimit, t.aiTarget ?? 18) - (commits.get(t.id) ?? 0)]));
    const pool = [...recruits.values()].filter((r) => r.status === 'uncommitted' && !r.isTransfer).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
    for (const r of pool) {
      let best: TeamContext | null = null;
      let bestScore = -Infinity;
      for (const t of aiTeams) {
        if ((need.get(t.id) ?? 0) <= 0) continue;
        const score = fitScore(r, t, interests.get(key(r.id, t.id)), totalTeams) + rng.range(0, 0.08);
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (!best) break;
      need.set(best.id, need.get(best.id)! - 1);
      commits.set(best.id, (commits.get(best.id) ?? 0) + 1);
      r.status = 'signed';
      r.committedTeamId = best.id;
      events.push({ recruitId: r.id, teamId: best.id, previousTeamId: null, event: 'signed' });
    }
  }

  const original = new Map(input.recruits.map((r) => [r.id, r]));
  const recruitUpdates = [...recruits.values()]
    .filter((r) => {
      const o = original.get(r.id)!;
      return o.status !== r.status || o.committedTeamId !== r.committedTeamId;
    })
    .map((r) => ({ id: r.id, status: r.status, committedTeamId: r.committedTeamId }));

  return {
    interests: [...changed].map((k) => interests.get(k)!).map((i) => ({ ...i, interest: +i.interest.toFixed(2), relationship: +i.relationship.toFixed(2) })),
    events,
    actionNotes: notes,
    recruitUpdates,
  };
}

/**
 * Computer-controlled programs recruit too, so owners face real competition.
 * Each AI school spends its weekly points on the prospects that fit it best.
 */
export function generateAiActions(
  aiTeams: TeamContext[], recruits: RecruitState[], interests: InterestState[], rules: RecruitingRules, week: number, seed: string,
): WeekAction[] {
  const rng = createRng(`${seed}-ai-w${week}`);
  const byKey = new Map(interests.map((i) => [`${i.recruitId}|${i.teamId}`, i]));
  const available = recruits.filter((r) => r.status === 'uncommitted' || r.status === 'committed');
  const actions: WeekAction[] = [];
  const total = Math.max(aiTeams.length, 2);
  const offersByTeam = new Map<string, number>();
  for (const i of interests) if (i.offered) offersByTeam.set(i.teamId, (offersByTeam.get(i.teamId) ?? 0) + 1);

  for (const t of aiTeams) {
    if (t.commits >= rules.scholarshipLimit) continue;
    const band = t.prestige >= 85 ? [4, 5] : t.prestige >= 72 ? [3, 5] : t.prestige >= 58 ? [2, 4] : [1, 3];
    const pool = available
      .filter((r) => r.stars >= band[0] && r.stars <= band[1] && r.committedTeamId !== t.id && (!r.isTransfer || r.fromTeamId !== t.id))
      .map((r) => {
        const i = byKey.get(`${r.id}|${t.id}`);
        const need = 1 - clamp(((t.bestAtPosition[r.position] ?? 50) - r.overall) / 30, 0, 1);
        return { r, i, score: fitScore(r, t, i, total) * (0.6 + need) * (r.stars / 3) + (i ? i.interest / 150 : 0) + rng.range(0, 0.15) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
    let points = rules.weeklyPoints;
    let offers = offersByTeam.get(t.id) ?? 0;
    let visits = 0;
    const spend = (a: WeekAction) => {
      const c = rules.costs[a.type];
      if (c > points) return false;
      points -= c;
      actions.push(a);
      return true;
    };
    for (const { r, i } of pool.slice(0, 9)) {
      if (!i?.offered && offers < rules.maxActiveOffers && rng.chance(0.55)) {
        spend({ teamId: t.id, recruitId: r.id, type: 'offer' });
        offers++;
      }
    }
    for (const { r, i } of pool) {
      if (points <= 0) break;
      if (i?.offered && !i.visited && visits < rules.maxVisitsPerWeek && i.interest > 35 && rng.chance(0.5)) {
        if (spend({ teamId: t.id, recruitId: r.id, type: 'visit' })) visits++;
        continue;
      }
      if (i && i.interest > 20 && rng.chance(0.6)) {
        spend({ teamId: t.id, recruitId: r.id, type: 'pitch', pitchAngle: topPriorities(r.priorities, 2)[rng.int(0, 1)] });
        continue;
      }
      spend({ teamId: t.id, recruitId: r.id, type: 'contact' });
    }
  }
  return actions;
}

/** 247-style class score: best commits count most */
export function classScore(commits: { stars: number; overall: number }[]): number {
  const vals = commits
    .map((c) => c.stars ** 2 * 3 + c.overall * 0.6)
    .sort((a, b) => b - a);
  return +vals.reduce((a, v, i) => a + v * 0.93 ** i, 0).toFixed(2);
}
