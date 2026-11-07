import { describe, expect, it } from 'vitest';
import { computePoll, powerRatings } from '@/lib/rankings/compute';
import { buildBracket, resolveMatchup, roundName, seedOrder, selectField } from '@/lib/playoffs';
import type { GameRow } from '@/lib/standings';

const teams = Array.from({ length: 30 }, (_, i) => ({ id: `T${String(i).padStart(2, '0')}`, conferenceId: `C${i % 3}`, prestige: 90 - i * 2, overall: 88 - i }));
// Round-robin-ish results where lower index usually wins
const games: GameRow[] = [];
let n = 0;
for (let w = 1; w <= 8; w++) {
  for (let i = 0; i < 30; i += 2) {
    const a = teams[(i + w) % 30].id;
    const b = teams[(i + w * 3 + 1) % 30].id;
    if (a === b) continue;
    const ai = Number(a.slice(1));
    const bi = Number(b.slice(1));
    games.push({ id: `g${n++}`, week: w, homeTeamId: a, awayTeamId: b, homeScore: ai < bi ? 31 : 14, awayScore: ai < bi ? 17 : 28, status: 'final', isConferenceGame: false, gameType: 'regular', neutralSite: false });
  }
}
const input = { teams, games, conferenceChampions: new Set(['T00']), previous: new Map<string, number>(), seed: 'rank-test' };

describe('rankings', () => {
  it('produces a valid top 25 for every poll', () => {
    for (const poll of ['computer', 'coaches', 'media', 'playoff'] as const) {
      const r = computePoll(poll, input);
      expect(r).toHaveLength(25);
      expect(new Set(r.map((x) => x.teamId)).size).toBe(25);
      expect(r.map((x) => x.rank)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    }
  });
  it('ranks dominant teams near the top and is deterministic', () => {
    const a = computePoll('computer', input);
    expect(a.slice(0, 5).map((x) => x.teamId)).toContain('T00');
    expect(computePoll('coaches', input)).toEqual(computePoll('coaches', input));
    expect(a[0].breakdown).toHaveProperty('strengthOfSchedule');
  });
  it('power ratings follow results', () => {
    const p = powerRatings(teams, games);
    expect(p.get('T00')!).toBeGreaterThan(p.get('T29')!);
  });
});

describe('playoffs', () => {
  it('builds standard seed orders', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it('gives byes to the top four in a 12-team bracket', () => {
    const b = buildBracket(12);
    const r1 = b.filter((m) => m.round === 1);
    expect(r1).toHaveLength(4);
    const seedsInR1 = r1.flatMap((m) => m.sources.map((s) => ('seed' in s ? s.seed : 0)));
    expect(seedsInR1.sort((x, y) => x - y)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(b.filter((m) => m.round === 4)).toHaveLength(1);
    expect(roundName(12, 4)).toBe('National Championship');
    expect(roundName(12, 2)).toBe('Quarterfinal');
  });
  it('supports 4, 8 and 16 team fields', () => {
    expect(buildBracket(4)).toHaveLength(3);
    expect(buildBracket(8)).toHaveLength(7);
    expect(buildBracket(16)).toHaveLength(15);
  });
  it('grants automatic bids to the highest-ranked champions', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => `T${i}`);
    const champs = [{ teamId: 'T0', conferenceId: 'A' }, { teamId: 'T25', conferenceId: 'B' }, { teamId: 'T28', conferenceId: 'C' }];
    const field = selectField(ranked, champs, 12, 2);
    expect(field).toHaveLength(12);
    expect(field.find((s) => s.teamId === 'T25')?.bidType).toBe('auto');
    expect(field.find((s) => s.teamId === 'T28')).toBeUndefined();
    expect(field[0]).toMatchObject({ seed: 1, teamId: 'T0', bidType: 'auto' });
  });
  it('resolves later rounds from winners', () => {
    const b = buildBracket(4);
    const seeds = new Map([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']]);
    const final = b.find((m) => m.round === 2)!;
    expect(resolveMatchup(final, seeds, new Map())).toEqual([null, null]);
    expect(resolveMatchup(final, seeds, new Map([['1-1', 'A'], ['1-2', 'C']]))).toEqual(['A', 'C']);
  });
});
