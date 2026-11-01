// Odds helper: turns team results + your ratings into suggested lines, and player stats into suggested props.
import { store } from '../core.js';
import { moneylineFromSpread, probToAmerican, positionGroups } from '../shared.js';

export const HOME_FIELD = 2.5; // points
const REGRESS_GAMES = 3;       // how many games before results outweigh your preseason rating

const finals = (season) => store.games.filter((g) => String(g.season) === String(season) && g.status === 'final');

/** Average points per team per game across the league (24 if nothing played yet). */
export function leagueAvgPoints(season) {
  const f = finals(season);
  if (!f.length) return 24;
  return f.reduce((s, g) => s + g.homeScore + g.awayScore, 0) / (f.length * 2);
}

/**
 * Power ratings: "points better than an average team" on a neutral field.
 * Blends your manual rating (team.rating) with a strength-of-schedule-adjusted rating from results.
 * Returns { teamId: { rating, manual, auto, gp, w, l, t, pfAvg, paAvg, offAvg, defAvg } }
 */
export function powerRatings(season) {
  const lg = leagueAvgPoints(season);
  const out = {};
  for (const t of store.teams) out[t.id] = { manual: Number(t.rating) || 0, auto: 0, gp: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, games: [] };
  for (const g of finals(season)) {
    const h = out[g.homeId], a = out[g.awayId];
    if (!h || !a) continue;
    const hfa = g.neutral ? 0 : HOME_FIELD;
    const hm = g.homeScore - g.awayScore - hfa; // home margin with home field removed
    h.games.push({ opp: g.awayId, margin: hm }); a.games.push({ opp: g.homeId, margin: -hm });
    h.pf += g.homeScore; h.pa += g.awayScore; a.pf += g.awayScore; a.pa += g.homeScore;
    h.gp++; a.gp++;
    if (g.homeScore > g.awayScore) { h.w++; a.l++; } else if (g.homeScore < g.awayScore) { h.l++; a.w++; } else { h.t++; a.t++; }
  }
  // simple rating system: rating = average margin + average opponent rating (iterated)
  const ids = Object.keys(out).filter((id) => out[id].gp);
  const cap = (m) => Math.max(-28, Math.min(28, m)); // don't let blowouts dominate
  for (let it = 0; it < 60; it++) {
    const next = {};
    for (const id of ids) {
      const r = out[id];
      next[id] = r.games.reduce((s, x) => s + cap(x.margin) + (out[x.opp].gp ? out[x.opp].auto : out[x.opp].manual), 0) / r.games.length;
    }
    const mean = ids.length ? ids.reduce((s, id) => s + next[id], 0) / ids.length : 0;
    // damped update: keeps small schedules (where teams only played each other in a loop) from oscillating
    for (const id of ids) out[id].auto = 0.5 * out[id].auto + 0.5 * (next[id] - mean);
  }
  for (const r of Object.values(out)) {
    const wResults = r.gp / (r.gp + REGRESS_GAMES);
    r.rating = Math.round(((1 - wResults) * r.manual + wResults * r.auto) * 10) / 10;
    r.pfAvg = r.gp ? r.pf / r.gp : null;
    r.paAvg = r.gp ? r.pa / r.gp : null;
    // regressed scoring rates used for totals
    r.offAvg = (r.pf + lg * REGRESS_GAMES) / (r.gp + REGRESS_GAMES);
    r.defAvg = (r.pa + lg * REGRESS_GAMES) / (r.gp + REGRESS_GAMES);
    delete r.games;
  }
  return out;
}

const half = (x) => Math.round(x * 2) / 2;
const hook = (x) => Math.max(0.5, Math.floor(x) + 0.5); // always end in .5 so totals can't push
// nearest .5 line; a whole-number average (e.g. 3.0 TDs) goes down to 2.5 like a real book
const propLine = (x) => Math.max(0.5, Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) - 0.5 : Math.floor(x) + 0.5);

/** Suggested lines for one game. */
export function suggestLines(g, ratings) {
  const h = ratings[g.homeId], a = ratings[g.awayId];
  if (!h || !a) return null;
  const margin = h.rating - a.rating + (g.neutral ? 0 : HOME_FIELD); // expected home margin
  const homePts = (h.offAvg + a.defAvg) / 2, awayPts = (a.offAvg + h.defAvg) / 2;
  const total = homePts + awayPts;
  const homeExp = total / 2 + margin / 2, awayExp = total / 2 - margin / 2;
  const spread = half(-margin);
  const ml = moneylineFromSpread(spread);
  const j = { over: -110, under: -110 };
  return {
    spread: { home: spread, homeOdds: -110, awayOdds: -110 },
    ml,
    total: { line: hook(total), ...j },
    homeTotal: { line: hook(homeExp), ...j },
    awayTotal: { line: hook(awayExp), ...j },
    exact: { odds: store.settings.exactScoreOdds || 2500 },
  };
}

/* ---------------------------------------------------------------- player props */
// which stats to offer per position group, how many players per team, and the minimum per-game average
const PROP_PLAN = [
  { groups: ['QB'], take: 1, rankBy: 'pass_yds', stats: [['pass_yds', 40], ['pass_td', 0.4], ['pass_comp', 5], ['rush_yds', 20]] },
  { groups: ['RB'], take: 2, rankBy: 'rush_yds', stats: [['rush_yds', 15], ['rec_yds', 12], ['total_td', 0.3]] },
  { groups: ['WR', 'TE'], take: 3, rankBy: 'rec_yds', stats: [['rec_yds', 15], ['rec', 1.5], ['total_td', 0.3]] },
  { groups: ['ATH'], take: 1, rankBy: 'rec_yds', stats: [['rec_yds', 15], ['rush_yds', 15]] },
  { groups: ['K'], take: 1, rankBy: 'fg_made', stats: [['fg_made', 0.5], ['kick_pts', 3]] },
  { groups: ['DL', 'LB', 'DB'], take: 2, rankBy: 'tackles', stats: [['tackles', 2], ['sacks', 0.3]] },
];

function teamGamesPlayed(teamId, season) {
  return finals(season).filter((g) => g.homeId === teamId || g.awayId === teamId).length;
}

const derived = (s, k) => {
  if (k === 'total_td') return (Number(s.rush_td) || 0) + (Number(s.rec_td) || 0);
  if (k === 'kick_pts') return (Number(s.fg_made) || 0) * 3 + (Number(s.xp_made) || 0);
  return Number(s[k]) || 0;
};

/**
 * Suggested player props for a game from season stats.
 * seasonStats = { playerId: totals (with gp when built from box scores) }, statsSeason = season those stats are from.
 */
export function suggestProps(g, seasonStats, statsSeason) {
  const out = [];
  for (const teamId of [g.awayId, g.homeId]) {
    const roster = store.players.filter((p) => p.teamId === teamId);
    const used = new Set();
    for (const plan of PROP_PLAN) {
      const cands = roster
        .filter((p) => !used.has(p.id) && positionGroups(p.positions).some((x) => plan.groups.includes(x)) && seasonStats[p.id])
        .map((p) => {
          const s = seasonStats[p.id];
          const gp = s.gp || teamGamesPlayed(teamId, statsSeason) || 1;
          return { p, s, gp, rank: derived(s, plan.rankBy) / gp };
        })
        .filter((x) => x.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, plan.take);
      for (const c of cands) {
        used.add(c.p.id);
        for (const [stat, min] of plan.stats) {
          const avg = derived(c.s, stat) / c.gp;
          if (avg < min) continue;
          out.push({ gameId: g.id, playerId: c.p.id, stat, avg: Math.round(avg * 10) / 10, line: propLine(avg), over: -110, under: -110 });
        }
      }
    }
  }
  return out;
}

/** Odds for "which team will…" specials from power ratings. */
export function teamPickOdds(teamIds, ratings, overround = 1.25) {
  const w = teamIds.map((id) => Math.exp((ratings[id]?.rating || 0) / 6));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => probToAmerican(Math.min(0.8, (x / sum) * overround)));
}

/** The most recent season (current first) that has player stats, for prop suggestions. */
export function statSeasonsToTry() {
  const cur = String(store.settings.currentSeason);
  const others = store.seasons.map(String).filter((s) => s !== cur).sort().reverse();
  return [cur, ...others];
}
