import { describe, expect, it } from 'vitest';
import { simulateGame } from '@/lib/sim/engine';
import { DEFAULT_SIM_SETTINGS, type SimInput } from '@/lib/sim/types';
import { makeTeam } from '@/lib/sim/__fixtures__/teams';

const strong = makeTeam('str', 86);
const weak = makeTeam('wk', 70);
const even = makeTeam('evn', 76);
const input = (seed: string, over: Partial<SimInput> = {}): SimInput => ({
  home: strong, away: weak, neutralSite: false, settings: DEFAULT_SIM_SETTINGS, seed, ...over,
});

describe('simulation engine', () => {
  it('is reproducible from its seed', () => {
    const a = simulateGame(input('repeat-me'));
    const b = simulateGame(input('repeat-me'));
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.plays.map((p) => p.description)).toEqual(b.plays.map((p) => p.description));
    const c = simulateGame(input('different-seed'));
    expect(c.plays.map((p) => p.description)).not.toEqual(a.plays.map((p) => p.description));
  });

  it('never ends in a tie and the final score matches scoring plays', () => {
    for (let i = 0; i < 150; i++) {
      const r = simulateGame(input(`tie-${i}`, { home: even, away: makeTeam('evn2', 76) }));
      expect(r.homeScore).not.toBe(r.awayScore);
      const last = r.plays[r.plays.length - 1];
      expect(last.homeScore).toBe(r.homeScore);
      expect(last.awayScore).toBe(r.awayScore);
      expect(r.teamStats.home.quarters.reduce((a, b) => a + b, 0)).toBe(r.homeScore);
      expect(r.teamStats.away.quarters.reduce((a, b) => a + b, 0)).toBe(r.awayScore);
      expect(r.winnerTeamId).toBe(r.homeScore > r.awayScore ? r.homeTeamId : r.awayTeamId);
    }
  });

  it('keeps player statistics consistent with team statistics', () => {
    for (let i = 0; i < 40; i++) {
      const r = simulateGame(input(`box-${i}`));
      for (const side of ['home', 'away'] as const) {
        const t = r.teamStats[side];
        const lines = r.playerStats.filter((p) => p.teamId === t.teamId);
        const sum = (k: keyof (typeof lines)[number]) => lines.reduce((a, p) => a + (p[k] as number), 0);
        expect(sum('passYds')).toBe(t.passYards);
        expect(sum('recYds')).toBe(t.passYards);
        expect(sum('rushYds')).toBe(t.rushYards);
        expect(sum('passCmp')).toBe(t.passCmp);
        expect(sum('rec')).toBe(t.passCmp);
        expect(sum('passAtt')).toBe(t.passAtt);
        expect(sum('rushAtt')).toBe(t.rushAtt);
        expect(t.totalYards).toBe(t.passYards + t.rushYards);
        // points = 6*TD + kicks + 2pt + safeties
        const td = sum('passTd') + sum('rushTd');
        expect(sum('passTd')).toBe(sum('recTd'));
        expect(t.points).toBeGreaterThanOrEqual(td * 6 + sum('fgm') * 3 + sum('xpm'));
        const opp = r.teamStats[side === 'home' ? 'away' : 'home'];
        const oppLines = r.playerStats.filter((p) => p.teamId === opp.teamId);
        expect(oppLines.reduce((a, p) => a + p.defInt, 0)).toBe(lines.reduce((a, p) => a + p.passInt, 0));
      }
    }
  });

  it('gives stronger teams an edge without predetermining results', () => {
    let strongWins = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const r = simulateGame(input(`edge-${i}`, { neutralSite: true }));
      if (r.winnerTeamId === strong.id) strongWins++;
    }
    expect(strongWins / n).toBeGreaterThan(0.75);
    expect(strongWins / n).toBeLessThan(0.99); // upsets happen
  });

  it('upset frequency slider increases upsets', () => {
    const rate = (upsetFrequency: number, randomness: number) => {
      let upsets = 0;
      for (let i = 0; i < 300; i++) {
        const r = simulateGame(input(`up-${i}`, { neutralSite: true, settings: { ...DEFAULT_SIM_SETTINGS, upsetFrequency, randomness } }));
        if (r.winnerTeamId === weak.id) upsets++;
      }
      return upsets / 300;
    };
    expect(rate(100, 100)).toBeGreaterThan(rate(0, 0));
  });

  it('produces overtime games with college rules', () => {
    let ot = 0;
    for (let i = 0; i < 400 && ot < 3; i++) {
      const r = simulateGame(input(`ot-${i}`, { home: even, away: makeTeam('evn3', 76), neutralSite: true }));
      if (r.overtimes > 0) {
        ot++;
        expect(r.teamStats.home.quarters.length).toBe(4 + r.overtimes);
        expect(r.tags).toContain('overtime');
      }
    }
    expect(ot).toBeGreaterThan(0);
  });

  it('win probability ends at 1 or 0 and stays within bounds', () => {
    const r = simulateGame(input('wp'));
    for (const p of r.plays) {
      expect(p.homeWinProb).toBeGreaterThanOrEqual(0);
      expect(p.homeWinProb).toBeLessThanOrEqual(1);
    }
    expect(r.plays[r.plays.length - 1].homeWinProb).toBe(r.homeScore > r.awayScore ? 1 : 0);
  });

  it('records drives that account for every point', () => {
    for (let i = 0; i < 30; i++) {
      const r = simulateGame(input(`drv-${i}`));
      const fromDrives = (team: string) => r.drives.filter((d) => d.teamId === team).reduce((a, d) => a + d.points, 0);
      // drive points never exceed team points (defensive/return scores are not offensive drive points)
      expect(fromDrives(r.homeTeamId)).toBeLessThanOrEqual(r.homeScore);
      expect(fromDrives(r.awayTeamId)).toBeLessThanOrEqual(r.awayScore);
    }
  });
});

describe('per-play stat deltas', () => {
  it('sum exactly to the final individual statistics', () => {
    for (let i = 0; i < 25; i++) {
      const r = simulateGame(input(`delta-${i}`));
      const totals = new Map<string, number>();
      for (const p of r.plays) for (const [id, k, v] of p.statDeltas ?? []) totals.set(`${id}.${k}`, Math.round(((totals.get(`${id}.${k}`) ?? 0) + v) * 10) / 10);
      for (const line of r.playerStats) {
        for (const k of ['passYds', 'rushYds', 'recYds', 'tackles', 'passTd', 'sacks', 'fgm', 'xpm'] as const) {
          expect(totals.get(`${line.playerId}.${k}`) ?? 0).toBe(line[k]);
        }
      }
    }
  });
});
