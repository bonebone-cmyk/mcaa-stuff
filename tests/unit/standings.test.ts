import { describe, expect, it } from 'vitest';
import { computeRecords, sortStandings, strengthOfSchedule, type GameRow } from '@/lib/standings';

let n = 0;
const g = (week: number, home: string, away: string, hs: number, as: number, conf = true, extra: Partial<GameRow> = {}): GameRow => ({
  id: `g${n++}`, week, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, status: 'final',
  isConferenceGame: conf, gameType: 'regular', neutralSite: false, ...extra,
});

describe('standings', () => {
  const games = [
    g(1, 'A', 'B', 21, 14), g(2, 'B', 'C', 30, 3), g(3, 'C', 'A', 24, 17), g(4, 'D', 'A', 7, 35),
    g(5, 'B', 'D', 28, 0), g(6, 'C', 'D', 14, 10), g(7, 'A', 'X', 50, 0, false),
    g(8, 'A', 'B', 0, 0, true, { status: 'scheduled', homeScore: null, awayScore: null }),
    g(9, 'A', 'C', 10, 3, false, { gameType: 'exhibition' }),
  ];
  const records = computeRecords(games, ['A', 'B', 'C', 'D']);

  it('counts only official finals and splits conference/home/away', () => {
    const a = records.get('A')!;
    expect([a.wins, a.losses]).toEqual([3, 1]);
    expect([a.confWins, a.confLosses]).toEqual([2, 1]);
    expect([a.homeWins, a.awayWins, a.awayLosses]).toEqual([2, 1, 1]);
    expect(a.pointsFor).toBe(21 + 17 + 35 + 50);
    expect(a.streak).toBe('W2');
  });

  it('breaks a three-way tie by head-to-head then overall record', () => {
    // A, B, C are all 2-1 in conference; head-to-head among them is 1-1 each → overall record decides
    const order = sortStandings(['D', 'C', 'B', 'A'], records, games);
    expect(order[3]).toBe('D');
    expect(order[0]).toBe('A'); // 3-1 overall
  });

  it('uses head-to-head for a two-way tie', () => {
    const two = [g(1, 'P', 'Q', 10, 7), g(2, 'Q', 'R', 20, 3), g(3, 'P', 'R', 3, 20), g(4, 'Q', 'S', 9, 3), g(5, 'P', 'S', 9, 3)];
    const r = computeRecords(two);
    // P and Q are 2-1 conf (Q 2-1, P 2-1); P beat Q
    expect(sortStandings(['Q', 'P'], r, two)).toEqual(['P', 'Q']);
  });

  it('computes strength of schedule between 0 and 1', () => {
    const sos = strengthOfSchedule('A', games, records);
    expect(sos).toBeGreaterThan(0);
    expect(sos).toBeLessThan(1);
  });
});
