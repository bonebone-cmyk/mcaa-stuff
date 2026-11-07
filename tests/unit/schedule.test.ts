import { describe, expect, it } from 'vitest';
import { assignBroadcasts, generateSchedule } from '@/lib/schedule/generate';
import { TEAMS, CONFERENCES, RIVALRIES } from '@/lib/data/teams';

describe('schedule generator', () => {
  const teams = TEAMS.map((t) => ({ id: t.slug, conferenceId: t.conference }));
  const confs = CONFERENCES.map((c) => ({ id: c.slug, conferenceGames: c.conferenceGames }));
  const rivals = RIVALRIES.map((r, i) => ({ id: `r${i}`, teamAId: r.a, teamBId: r.b, annual: true }));
  const games = generateSchedule(teams, confs, rivals, { weeks: 13, gamesPerTeam: 12, seed: 'test-2026' });

  it('never schedules a team twice in one week or repeats a matchup', () => {
    const perWeek = new Map<string, number>();
    const pairs = new Set<string>();
    for (const g of games) {
      for (const t of [g.homeTeamId, g.awayTeamId]) {
        const k = `${g.week}-${t}`;
        perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
        expect(perWeek.get(k)).toBe(1);
      }
      const p = [g.homeTeamId, g.awayTeamId].sort().join('|');
      expect(pairs.has(p)).toBe(false);
      pairs.add(p);
    }
  });

  it('gives nearly every team a full slate and plays annual rivalries', () => {
    const counts = new Map<string, number>();
    for (const g of games) for (const t of [g.homeTeamId, g.awayTeamId]) counts.set(t, (counts.get(t) ?? 0) + 1);
    const values = teams.map((t) => counts.get(t.id) ?? 0);
    expect(Math.max(...values)).toBeLessThanOrEqual(12);
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeGreaterThan(11.5);
    const rivalryGames = games.filter((g) => g.rivalryId).length;
    expect(rivalryGames / rivals.length).toBeGreaterThan(0.9);
  });

  it('marks conference games correctly', () => {
    const conf = new Map(teams.map((t) => [t.id, t.conferenceId]));
    for (const g of games) expect(g.isConferenceGame).toBe(!!conf.get(g.homeTeamId) && conf.get(g.homeTeamId) === conf.get(g.awayTeamId));
  });

  it('assigns kickoff times and a game of the week per week', () => {
    const b = assignBroadcasts(games, new Map(), [{ id: 'n1', tier: 1 }, { id: 'n2', tier: 2 }], 2026, 'x');
    expect(b).toHaveLength(games.length);
    const gotw = b.filter((x) => x.isGameOfWeek);
    expect(gotw).toHaveLength(13);
    expect(new Date(b[0].kickoffAt).getUTCFullYear()).toBe(2026);
  });
});
