import { describe, expect, it } from 'vitest';
import { classScore, DEFAULT_RULES, fitScore, generateAiActions, processRecruitingWeek, randomPriorities, type InterestState, type RecruitState, type TeamContext } from '@/lib/recruiting/engine';
import { generateRecruitClass } from '@/lib/recruiting/generate';
import { createRng } from '@/lib/rng';

const team = (id: string, prestige: number, lat = 33, lng = -87): TeamContext => ({
  id, prestige, coachRating: 50 + prestige / 3, latitude: lat, longitude: lng, offenseScheme: 'spread', defenseScheme: '4-3',
  recentWinPct: prestige / 100, powerRank: 100 - prestige, bestAtPosition: { QB: 70 }, commits: 0, isAi: false,
});
const recruit = (id: string, over: Partial<RecruitState> = {}): RecruitState => ({
  id, position: 'QB', stars: 4, overall: 74, potential: 88, latitude: 33.2, longitude: -87.5, preferredScheme: 'spread',
  priorities: randomPriorities(createRng(id), 4), status: 'uncommitted', committedTeamId: null, isTransfer: false, fromTeamId: null, ...over,
});

describe('recruiting engine', () => {
  it('generates ranked classes with sensible star distribution', () => {
    const c = generateRecruitClass('cls', 1000, 2027);
    expect(c).toHaveLength(1000);
    expect(c[0].nationalRank).toBe(1);
    const fives = c.filter((r) => r.stars === 5).length;
    expect(fives).toBeGreaterThan(5);
    expect(fives).toBeLessThan(30);
    expect(c[0].overall).toBeGreaterThan(c[999].overall);
  });

  it('nearby prestigious programs fit better', () => {
    const r = recruit('fit', { priorities: { prestige: 0.3, proximity: 0.3, playingTime: 0.05, coach: 0.05, success: 0.1, championship: 0.1, scheme: 0.05, visits: 0.025, relationship: 0.025 } });
    expect(fitScore(r, team('near', 90))).toBeGreaterThan(fitScore(r, team('far', 40, 47, -122)));
  });

  it('requires an offer before committing, and commits a recruit only once', () => {
    const teams = [team('A', 90), team('B', 70)];
    let recruits = [recruit('r1')];
    let interests: InterestState[] = [];
    // contacts without an offer never produce a commitment
    for (let w = 1; w <= 6; w++) {
      const out = processRecruitingWeek({ recruits, interests, teams, actions: [{ teamId: 'A', recruitId: 'r1', type: 'contact' }, { teamId: 'A', recruitId: 'r1', type: 'pitch', pitchAngle: 'prestige' }], rules: DEFAULT_RULES, week: w, seed: 's', signingDay: false });
      interests = mergeI(interests, out.interests);
      expect(out.events.filter((e) => e.event === 'commit')).toHaveLength(0);
    }
    // with an offer and continued effort, A eventually lands the commitment
    let committed = false;
    for (let w = 7; w <= 30 && !committed; w++) {
      const out = processRecruitingWeek({ recruits, interests, teams, actions: [{ teamId: 'A', recruitId: 'r1', type: w === 7 ? 'offer' : w === 8 ? 'visit' : 'pitch', pitchAngle: 'prestige' }, { teamId: 'A', recruitId: 'r1', type: 'contact' }], rules: DEFAULT_RULES, week: w, seed: 's', signingDay: false });
      interests = mergeI(interests, out.interests);
      for (const u of out.recruitUpdates) recruits = recruits.map((r) => (r.id === u.id ? { ...r, ...u } : r));
      const commits = out.events.filter((e) => e.event === 'commit');
      expect(commits.length).toBeLessThanOrEqual(1);
      if (commits.length) { committed = true; expect(commits[0].teamId).toBe('A'); }
    }
    expect(committed).toBe(true);
  });

  it('signs committed recruits on signing day and respects scholarship limits', () => {
    const teams = [{ ...team('A', 90), commits: DEFAULT_RULES.scholarshipLimit }, team('B', 60)];
    const recruits = [recruit('full')];
    const interests: InterestState[] = [
      { recruitId: 'full', teamId: 'A', interest: 95, relationship: 50, scouted: true, offered: true, offeredWeek: 1, visited: true, visitWeek: 2, pitches: 3, lastActionWeek: 3 },
      { recruitId: 'full', teamId: 'B', interest: 40, relationship: 10, scouted: false, offered: true, offeredWeek: 1, visited: false, visitWeek: null, pitches: 0, lastActionWeek: 3 },
    ];
    const out = processRecruitingWeek({ recruits, interests, teams, actions: [], rules: DEFAULT_RULES, week: 16, seed: 'sd', signingDay: true });
    const signed = out.events.find((e) => e.event === 'signed');
    expect(signed?.teamId).toBe('B'); // A has no scholarships left
  });

  it('is deterministic for the same seed', () => {
    const teams = [team('A', 80), team('B', 79)];
    const recruits = [recruit('d1'), recruit('d2', { position: 'WR' })];
    const args = { recruits, interests: [], teams, actions: [{ teamId: 'A', recruitId: 'd1', type: 'offer' as const }, { teamId: 'B', recruitId: 'd2', type: 'contact' as const }], rules: DEFAULT_RULES, week: 1, seed: 'same', signingDay: false };
    expect(processRecruitingWeek(args).interests).toEqual(processRecruitingWeek(args).interests);
  });

  it('AI programs spend within their weekly budget', () => {
    const teams = [{ ...team('AI', 80), isAi: true }];
    const recruits = generateRecruitClass('ai', 300, 2027).map((g, i) => recruit(`x${i}`, { stars: g.stars, overall: g.overall, position: g.position }));
    const actions = generateAiActions(teams, recruits, [], DEFAULT_RULES, 1, 'ai');
    const spent = actions.reduce((a, x) => a + DEFAULT_RULES.costs[x.type], 0);
    expect(actions.length).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(DEFAULT_RULES.weeklyPoints);
  });

  it('class score rewards elite commits', () => {
    expect(classScore([{ stars: 5, overall: 82 }])).toBeGreaterThan(classScore([{ stars: 3, overall: 66 }]));
  });
});

function mergeI(a: InterestState[], b: InterestState[]) {
  const m = new Map(a.map((i) => [`${i.recruitId}|${i.teamId}`, i]));
  for (const i of b) m.set(`${i.recruitId}|${i.teamId}`, i);
  return [...m.values()];
}
