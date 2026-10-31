// Shared logic used by both the browser app and the Node server.
// Keep this file dependency-free (plain ES module).

/* ---------------------------------------------------------------- *
 * Positions
 * ---------------------------------------------------------------- */

// Canonical position -> stat group
export const POSITION_GROUP = {
  QB: 'QB',
  RB: 'RB', HB: 'RB', FB: 'RB',
  WR: 'WR', SLOT: 'WR',
  TE: 'TE',
  OL: 'OL', OT: 'OL', OG: 'OL', C: 'OL', LT: 'OL', RT: 'OL', LG: 'OL', RG: 'OL', IOL: 'OL', G: 'OL', T: 'OL',
  DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL', EDGE: 'DL',
  LB: 'LB', MLB: 'LB', OLB: 'LB', ILB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', NB: 'DB',
  K: 'K', PK: 'K',
  P: 'P',
  KR: 'RET', PR: 'RET', RET: 'RET',
  ATH: 'ATH',
  LS: 'LS',
};

export const POSITION_LIST = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C', 'DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'DB', 'K', 'P', 'KR', 'PR', 'ATH', 'LS'];

const POSITION_WORDS = {
  QUARTERBACK: 'QB', 'RUNNING BACK': 'RB', RUNNINGBACK: 'RB', HALFBACK: 'RB', FULLBACK: 'FB',
  'WIDE RECEIVER': 'WR', RECEIVER: 'WR', 'TIGHT END': 'TE', TIGHTEND: 'TE',
  'OFFENSIVE LINE': 'OL', 'OFFENSIVE LINEMAN': 'OL', TACKLE: 'OT', GUARD: 'OG', CENTER: 'C',
  'DEFENSIVE LINE': 'DL', 'DEFENSIVE LINEMAN': 'DL', 'DEFENSIVE END': 'DE', 'DEFENSIVE TACKLE': 'DT',
  LINEBACKER: 'LB', CORNERBACK: 'CB', CORNER: 'CB', SAFETY: 'S', KICKER: 'K', PUNTER: 'P',
  RETURNER: 'RET', 'KICK RETURNER': 'KR', 'PUNT RETURNER': 'PR', ATHLETE: 'ATH', 'LONG SNAPPER': 'LS',
  'KR/PR': 'RET', 'PR/KR': 'RET',
};

export function normalizePosition(token) {
  if (!token) return null;
  const t = String(token).toUpperCase().replace(/[^A-Z/ ]/g, '').trim();
  if (!t) return null;
  if (POSITION_GROUP[t]) return t;
  if (POSITION_WORDS[t]) return POSITION_WORDS[t];
  return null;
}

/** Split strings like "QB/WR", "QB, WR", "QB-WR" into canonical positions. */
export function parsePositions(str) {
  if (!str) return [];
  const s = String(str).toUpperCase();
  if (POSITION_WORDS[s.trim()]) return [POSITION_WORDS[s.trim()]];
  const out = [];
  for (const part of s.split(/[\/,;|&+\-\s]+/)) {
    const p = normalizePosition(part);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function positionGroups(positions = []) {
  const g = new Set();
  for (const p of positions) {
    const grp = POSITION_GROUP[p];
    if (grp) g.add(grp);
  }
  return [...g];
}

export const OFFENSE_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'ATH'];
export const DEFENSE_GROUPS = ['DL', 'LB', 'DB'];

/* ---------------------------------------------------------------- *
 * Classes
 * ---------------------------------------------------------------- */
export const CLASSES = ['FR', 'RS-FR', 'SO', 'RS-SO', 'JR', 'RS-JR', 'SR', 'RS-SR', 'GR'];

export function normalizeClass(token) {
  if (!token) return null;
  let t = String(token).toUpperCase().replace(/[.\s_]/g, '');
  let rs = false;
  if (/^(RS|R)-?/.test(t) && t.length > 2) { rs = true; t = t.replace(/^(RS|R)-?/, ''); }
  const map = {
    FR: 'FR', FRESH: 'FR', FRESHMAN: 'FR', FRESHMEN: 'FR', FY: 'FR', '1ST': 'FR',
    SO: 'SO', SOPH: 'SO', SOPHOMORE: 'SO', '2ND': 'SO',
    JR: 'JR', JUN: 'JR', JUNIOR: 'JR', '3RD': 'JR',
    SR: 'SR', SEN: 'SR', SENIOR: 'SR', '4TH': 'SR',
    GR: 'GR', GRAD: 'GR', GRADUATE: 'GR', '5TH': 'GR', '5TH-YEAR': 'GR', SUPERSENIOR: 'GR',
  };
  const base = map[t];
  if (!base) return null;
  if (rs && base !== 'GR') return 'RS-' + base;
  return base;
}

export const isFreshman = (cls) => cls === 'FR' || cls === 'RS-FR';

/* ---------------------------------------------------------------- *
 * Stats
 * ---------------------------------------------------------------- */
// groups = which position groups may have props on this stat
export const STATS = {
  pass_comp:   { label: 'Completions',          short: 'CMP',     cat: 'passing',   groups: ['QB'] },
  pass_att:    { label: 'Pass Attempts',        short: 'ATT',     cat: 'passing',   groups: ['QB'] },
  comp_pct:    { label: 'Completion %',         short: 'CMP%',    cat: 'passing',   groups: ['QB'], derived: true, decimals: 1 },
  pass_yds:    { label: 'Passing Yards',        short: 'PASS YDS', cat: 'passing',  groups: ['QB'] },
  pass_td:     { label: 'Passing TDs',          short: 'PASS TD', cat: 'passing',   groups: ['QB'] },
  int_thrown:  { label: 'Interceptions Thrown', short: 'INT',     cat: 'passing',   groups: ['QB'] },
  rush_att:    { label: 'Rush Attempts',        short: 'CAR',     cat: 'rushing',   groups: ['QB', 'RB', 'ATH'] },
  rush_yds:    { label: 'Rushing Yards',        short: 'RUSH YDS', cat: 'rushing',  groups: ['QB', 'RB', 'ATH'] },
  rush_td:     { label: 'Rushing TDs',          short: 'RUSH TD', cat: 'rushing',   groups: ['QB', 'RB', 'ATH'] },
  rec:         { label: 'Receptions',           short: 'REC',     cat: 'receiving', groups: ['RB', 'WR', 'TE', 'ATH'] },
  rec_yds:     { label: 'Receiving Yards',      short: 'REC YDS', cat: 'receiving', groups: ['RB', 'WR', 'TE', 'ATH'] },
  rec_td:      { label: 'Receiving TDs',        short: 'REC TD',  cat: 'receiving', groups: ['RB', 'WR', 'TE', 'ATH'] },
  targets:     { label: 'Targets',              short: 'TGT',     cat: 'receiving', groups: ['RB', 'WR', 'TE', 'ATH'] },
  scrim_yds:   { label: 'Rush + Rec Yards',     short: 'SCRIM',   cat: 'combo',     groups: ['RB', 'ATH'], derived: true },
  total_td:    { label: 'Total TDs (Rush+Rec)', short: 'TOT TD',  cat: 'combo',     groups: ['RB', 'WR', 'TE', 'ATH'], derived: true },
  pancakes:    { label: 'Pancakes',             short: 'PANC',    cat: 'blocking',  groups: ['OL', 'TE'] },
  sacks_allowed:{ label: 'Sacks Allowed',       short: 'SA',      cat: 'blocking',  groups: ['OL'] },
  tackles:     { label: 'Tackles',              short: 'TKL',     cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  tfl:         { label: 'Tackles for Loss',     short: 'TFL',     cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  sacks:       { label: 'Sacks',                short: 'SACK',    cat: 'defense',   groups: ['DL', 'LB', 'DB'], decimals: 1 },
  def_int:     { label: 'Interceptions',        short: 'INT',     cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  pass_def:    { label: 'Passes Defended',      short: 'PD',      cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  ff:          { label: 'Forced Fumbles',       short: 'FF',      cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  fr:          { label: 'Fumble Recoveries',    short: 'FR',      cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  def_td:      { label: 'Defensive TDs',        short: 'DEF TD',  cat: 'defense',   groups: ['DL', 'LB', 'DB'] },
  fg_made:     { label: 'Field Goals Made',     short: 'FGM',     cat: 'kicking',   groups: ['K'] },
  fg_att:      { label: 'Field Goal Attempts',  short: 'FGA',     cat: 'kicking',   groups: ['K'] },
  fg_long:     { label: 'Longest Field Goal',   short: 'LNG',     cat: 'kicking',   groups: ['K'], max: true },
  xp_made:     { label: 'Extra Points Made',    short: 'XPM',     cat: 'kicking',   groups: ['K'] },
  xp_att:      { label: 'Extra Point Attempts', short: 'XPA',     cat: 'kicking',   groups: ['K'] },
  kick_pts:    { label: 'Kicking Points',       short: 'K PTS',   cat: 'kicking',   groups: ['K'], derived: true },
  punts:       { label: 'Punts',                short: 'PUNTS',   cat: 'punting',   groups: ['P'] },
  punt_yds:    { label: 'Punt Yards',           short: 'P YDS',   cat: 'punting',   groups: ['P'] },
  punt_avg:    { label: 'Punt Average',         short: 'AVG',     cat: 'punting',   groups: ['P'], derived: true, decimals: 1 },
  punt_long:   { label: 'Longest Punt',         short: 'LNG',     cat: 'punting',   groups: ['P'], max: true },
  inside20:    { label: 'Punts Inside 20',      short: 'IN20',    cat: 'punting',   groups: ['P'] },
  kr_yds:      { label: 'Kick Return Yards',    short: 'KR YDS',  cat: 'returning', groups: ['RET'] },
  pr_yds:      { label: 'Punt Return Yards',    short: 'PR YDS',  cat: 'returning', groups: ['RET'] },
  ret_yds:     { label: 'Total Return Yards',   short: 'RET YDS', cat: 'returning', groups: ['RET'], derived: true },
  ret_td:      { label: 'Return TDs',           short: 'RET TD',  cat: 'returning', groups: ['RET'] },
};

export const STAT_CATEGORIES = [
  ['passing', 'Passing'], ['rushing', 'Rushing'], ['receiving', 'Receiving'], ['blocking', 'Blocking'],
  ['defense', 'Defense'], ['kicking', 'Kicking'], ['punting', 'Punting'], ['returning', 'Returning'],
];

export function statsForPositions(positions = []) {
  const groups = positionGroups(positions);
  return Object.keys(STATS).filter((k) => STATS[k].groups.some((g) => groups.includes(g)));
}

export function deriveStats(s = {}) {
  const n = (k) => Number(s[k]) || 0;
  const out = { ...s };
  if (n('pass_att') > 0) out.comp_pct = Math.round((n('pass_comp') / n('pass_att')) * 1000) / 10;
  if (s.rush_yds != null || s.rec_yds != null) out.scrim_yds = n('rush_yds') + n('rec_yds');
  if (s.rush_td != null || s.rec_td != null) out.total_td = n('rush_td') + n('rec_td');
  if (s.fg_made != null || s.xp_made != null) out.kick_pts = n('fg_made') * 3 + n('xp_made');
  if (n('punts') > 0) out.punt_avg = Math.round((n('punt_yds') / n('punts')) * 10) / 10;
  if (s.kr_yds != null || s.pr_yds != null) out.ret_yds = n('kr_yds') + n('pr_yds');
  return out;
}

/** Value of a stat for prop settlement (missing => 0). */
export function statValue(stats, key) {
  const d = deriveStats(stats || {});
  return Number(d[key]) || 0;
}

/** Sum a list of per-game stat objects into totals. */
export function sumStats(list) {
  const out = {};
  for (const s of list) {
    for (const [k, v] of Object.entries(s || {})) {
      if (STATS[k]?.derived) continue;
      const num = Number(v);
      if (!Number.isFinite(num)) continue;
      if (STATS[k]?.max) out[k] = Math.max(out[k] ?? -Infinity, num);
      else out[k] = (out[k] || 0) + num;
    }
  }
  return out;
}

// Header aliases for stat imports. Category-specific aliases are used when the
// admin picks a category (e.g. a "Passing" table where YDS means passing yards).
export const STAT_ALIASES = {
  _any: {
    cmp: 'pass_comp', comp: 'pass_comp', completions: 'pass_comp', passcmp: 'pass_comp',
    passatt: 'pass_att', patt: 'pass_att', passattempts: 'pass_att',
    passyds: 'pass_yds', passyards: 'pass_yds', passingyards: 'pass_yds', pyds: 'pass_yds', passingyds: 'pass_yds',
    passtd: 'pass_td', passtds: 'pass_td', passingtd: 'pass_td', passingtds: 'pass_td', ptd: 'pass_td', passingtouchdowns: 'pass_td',
    intthrown: 'int_thrown', ints_thrown: 'int_thrown', interceptionsthrown: 'int_thrown',
    car: 'rush_att', carries: 'rush_att', rushatt: 'rush_att', rushattempts: 'rush_att', rushes: 'rush_att',
    rushyds: 'rush_yds', rushyards: 'rush_yds', rushingyards: 'rush_yds', ryds: 'rush_yds', rushingyds: 'rush_yds',
    rushtd: 'rush_td', rushtds: 'rush_td', rushingtd: 'rush_td', rushingtds: 'rush_td', rushingtouchdowns: 'rush_td',
    rec: 'rec', recs: 'rec', receptions: 'rec', catches: 'rec',
    recyds: 'rec_yds', recyards: 'rec_yds', receivingyards: 'rec_yds', receivingyds: 'rec_yds',
    rectd: 'rec_td', rectds: 'rec_td', receivingtd: 'rec_td', receivingtds: 'rec_td', receivingtouchdowns: 'rec_td',
    tgt: 'targets', tgts: 'targets', targets: 'targets',
    pancakes: 'pancakes', panc: 'pancakes', pancake: 'pancakes', pnk: 'pancakes',
    sacksallowed: 'sacks_allowed', sa: 'sacks_allowed',
    tkl: 'tackles', tackles: 'tackles', tot: 'tackles', tkls: 'tackles', totaltackles: 'tackles',
    tfl: 'tfl', tacklesforloss: 'tfl',
    sack: 'sacks', sacks: 'sacks', sck: 'sacks',
    defint: 'def_int', interceptions: 'def_int',
    pd: 'pass_def', pbu: 'pass_def', passesdefended: 'pass_def', pdef: 'pass_def', passdefended: 'pass_def',
    ff: 'ff', forcedfumbles: 'ff', fr: 'fr', fumblerecoveries: 'fr', fumrec: 'fr',
    deftd: 'def_td', defensivetd: 'def_td', defensivetds: 'def_td',
    fgm: 'fg_made', fgmade: 'fg_made', fieldgoalsmade: 'fg_made', fga: 'fg_att', fgatt: 'fg_att', fieldgoalattempts: 'fg_att',
    fglong: 'fg_long', fglng: 'fg_long', xpm: 'xp_made', xpmade: 'xp_made', xpa: 'xp_att', xpatt: 'xp_att',
    punts: 'punts', no: null, puntyds: 'punt_yds', puntyards: 'punt_yds', in20: 'inside20', inside20: 'inside20', i20: 'inside20',
    puntlong: 'punt_long', puntlng: 'punt_long',
    kryds: 'kr_yds', kickreturnyards: 'kr_yds', pryds: 'pr_yds', puntreturnyards: 'pr_yds', rettd: 'ret_td', returntd: 'ret_td', returntds: 'ret_td',
  },
  passing: { att: 'pass_att', yds: 'pass_yds', yards: 'pass_yds', td: 'pass_td', tds: 'pass_td', int: 'int_thrown', ints: 'int_thrown', comp: 'pass_comp', cmp: 'pass_comp' },
  rushing: { att: 'rush_att', yds: 'rush_yds', yards: 'rush_yds', td: 'rush_td', tds: 'rush_td' },
  receiving: { yds: 'rec_yds', yards: 'rec_yds', td: 'rec_td', tds: 'rec_td', rec: 'rec' },
  blocking: { sacks: 'sacks_allowed', sck: 'sacks_allowed' },
  defense: { int: 'def_int', ints: 'def_int', td: 'def_td', tds: 'def_td', solo: null },
  kicking: { made: 'fg_made', att: 'fg_att', long: 'fg_long', lng: 'fg_long', xp: 'xp_made' },
  punting: { no: 'punts', yds: 'punt_yds', yards: 'punt_yds', long: 'punt_long', lng: 'punt_long', avg: null },
  returning: { kryds: 'kr_yds', pryds: 'pr_yds', td: 'ret_td', tds: 'ret_td' },
};

export function statKeyForHeader(header, category) {
  const h = String(header).toLowerCase().replace(/[^a-z0-9%]/g, '');
  if (!h) return null;
  if (STATS[header]) return header;
  if (category && STAT_ALIASES[category] && h in STAT_ALIASES[category]) return STAT_ALIASES[category][h];
  if (h in STAT_ALIASES._any) return STAT_ALIASES._any[h];
  for (const [k, def] of Object.entries(STATS)) {
    if (def.derived) continue;
    if (def.label.toLowerCase().replace(/[^a-z0-9]/g, '') === h) return k;
  }
  return null;
}

/* ---------------------------------------------------------------- *
 * Awards
 * ---------------------------------------------------------------- */
const n = (s, k) => Number(s?.[k]) || 0;

export const SCORE = {
  qb: (s) => n(s, 'pass_yds') * 0.04 + n(s, 'pass_td') * 4 - n(s, 'int_thrown') * 2 + n(s, 'rush_yds') * 0.1 + n(s, 'rush_td') * 6
    + (n(s, 'pass_att') >= 10 ? (n(s, 'pass_comp') / n(s, 'pass_att') - 0.6) * 20 : 0),
  rb: (s) => n(s, 'rush_yds') * 0.1 + n(s, 'rush_td') * 6 + n(s, 'rec') * 0.5 + n(s, 'rec_yds') * 0.1 + n(s, 'rec_td') * 6,
  wr: (s) => n(s, 'rec') * 0.5 + n(s, 'rec_yds') * 0.1 + n(s, 'rec_td') * 6 + n(s, 'rush_yds') * 0.1 + n(s, 'rush_td') * 6,
  ol: (s) => n(s, 'pancakes') * 2 - n(s, 'sacks_allowed') * 3,
  def: (s) => n(s, 'tackles') + n(s, 'tfl') * 2 + n(s, 'sacks') * 4 + n(s, 'def_int') * 5 + n(s, 'pass_def') * 1.5 + n(s, 'ff') * 4 + n(s, 'fr') * 3 + n(s, 'def_td') * 6,
  k: (s) => n(s, 'fg_made') * 3 + n(s, 'xp_made') - (n(s, 'fg_att') - n(s, 'fg_made')) * 2 - (n(s, 'xp_att') - n(s, 'xp_made')) + (n(s, 'fg_long') >= 50 ? 3 : 0),
  p: (s) => (n(s, 'punts') > 0 ? (n(s, 'punt_yds') / n(s, 'punts') - 35) * 2 + n(s, 'inside20') * 1.5 + n(s, 'punts') * 0.2 : 0),
  ret: (s) => n(s, 'kr_yds') * 0.05 + n(s, 'pr_yds') * 0.08 + n(s, 'ret_td') * 8,
  off: (s) => SCORE.qb(s) + n(s, 'rec') * 0.5 + n(s, 'rec_yds') * 0.1 + n(s, 'rec_td') * 6,
};

const hasGroup = (p, groups) => positionGroups(p.positions).some((g) => groups.includes(g));

function bestScore(p, s) {
  const g = positionGroups(p.positions);
  const opts = [0];
  if (g.some((x) => ['QB', 'RB', 'WR', 'TE', 'ATH'].includes(x))) opts.push(SCORE.off(s));
  if (g.includes('OL')) opts.push(SCORE.ol(s));
  if (g.some((x) => DEFENSE_GROUPS.includes(x))) opts.push(SCORE.def(s) * 1.15);
  if (g.includes('K')) opts.push(SCORE.k(s) * 0.8);
  if (g.includes('P')) opts.push(SCORE.p(s) * 0.8);
  if (g.includes('RET')) opts.push(SCORE.ret(s));
  return Math.max(...opts);
}

export const AWARDS = [
  { key: 'CRAFTSMAN', name: 'Craftsman', full: 'The Craftsman Trophy', desc: 'Most outstanding player in the MCAA',
    eligible: () => true, score: (p, s, ctx) => bestScore(p, s) * (1 + 0.5 * (ctx.winPct ?? 0)) },
  { key: 'QBOTY', name: 'QBOTY', full: 'Quarterback of the Year', desc: 'Best quarterback',
    eligible: (p) => hasGroup(p, ['QB']), score: (p, s) => SCORE.qb(s) },
  { key: 'WROTY', name: 'WROTY', full: 'Wide Receiver of the Year', desc: 'Best receiver',
    eligible: (p) => hasGroup(p, ['WR', 'TE']), score: (p, s) => SCORE.wr(s) },
  { key: 'RBOTY', name: 'RBOTY', full: 'Running Back of the Year', desc: 'Best running back',
    eligible: (p) => hasGroup(p, ['RB']), score: (p, s) => SCORE.rb(s) },
  { key: 'OLOTY', name: 'OLOTY', full: 'Offensive Lineman of the Year', desc: 'Best offensive lineman',
    eligible: (p) => hasGroup(p, ['OL']), score: (p, s, ctx) => SCORE.ol(s) + (ctx.winPct ?? 0) * 10 },
  { key: 'DLOTY', name: 'DLOTY', full: 'Defender of the Year', desc: 'Top defender at any defensive position (DL, LB, DB)',
    eligible: (p) => hasGroup(p, DEFENSE_GROUPS), score: (p, s) => SCORE.def(s) },
  { key: 'KOTY', name: 'KOTY', full: 'Kicker of the Year', desc: 'Best kicker',
    eligible: (p) => hasGroup(p, ['K']), score: (p, s) => SCORE.k(s) },
  { key: 'POTY', name: 'POTY', full: 'Punter of the Year', desc: 'Best punter',
    eligible: (p) => hasGroup(p, ['P']), score: (p, s) => SCORE.p(s) },
  { key: 'ROTY', name: 'ROTY', full: 'Returner of the Year', desc: 'Best kick/punt returner',
    eligible: (p) => hasGroup(p, ['RET']), score: (p, s) => SCORE.ret(s) },
  { key: 'FOTY', name: 'FOTY', full: 'Freshman of the Year', desc: 'Best freshman',
    eligible: (p) => isFreshman(p.cls), score: (p, s) => bestScore(p, s) },
  { key: 'OPOY', name: 'OPOY', full: 'Offensive Player of the Year', desc: 'Best offensive player',
    eligible: (p) => hasGroup(p, OFFENSE_GROUPS),
    score: (p, s) => Math.max(SCORE.off(s), hasGroup(p, ['OL']) ? SCORE.ol(s) : 0) },
  { key: 'DPOY', name: 'DPOY', full: 'Defensive Player of the Year', desc: 'Best defensive player',
    eligible: (p) => hasGroup(p, DEFENSE_GROUPS), score: (p, s) => SCORE.def(s) },
];

export const AWARD_BY_KEY = Object.fromEntries(AWARDS.map((a) => [a.key, a]));

/**
 * Recommend players for an award from season stats.
 * players: [{id, positions, cls, teamId}], seasonStats: {playerId: stats}, teamWinPct: {teamId: pct}
 */
export function recommendForAward(awardKey, players, seasonStats, teamWinPct = {}, limit = 10) {
  const award = AWARD_BY_KEY[awardKey];
  if (!award) return [];
  const rows = [];
  for (const p of players) {
    if (!award.eligible(p)) continue;
    const s = deriveStats(seasonStats[p.id] || {});
    if (!Object.keys(seasonStats[p.id] || {}).length) continue;
    const score = award.score(p, s, { winPct: teamWinPct[p.teamId] ?? 0 });
    if (score > 0) rows.push({ playerId: p.id, score: Math.round(score * 10) / 10 });
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, limit);
  const odds = suggestOddsFromScores(top.map((r) => r.score));
  top.forEach((r, i) => { r.odds = odds[i]; });
  return top;
}

/* ---------------------------------------------------------------- *
 * Odds
 * ---------------------------------------------------------------- */
export function isValidOdds(o) {
  const v = Number(o);
  return Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) >= 100 && Math.abs(v) <= 100000;
}

export function profitFor(stake, odds) {
  const o = Number(odds);
  return o > 0 ? (stake * o) / 100 : (stake * 100) / Math.abs(o);
}

/** Total payout (stake + profit), rounded down to whole coins. */
export function payoutFor(stake, odds) {
  return Math.floor(stake + profitFor(stake, odds) + 1e-9);
}

export function impliedProb(odds) {
  const o = Number(odds);
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

export function roundOdds(o) {
  const a = Math.abs(o);
  const step = a < 200 ? 5 : a < 1000 ? 10 : a < 5000 ? 50 : 100;
  let r = Math.round(a / step) * step;
  if (r < 100) r = 100;
  return o < 0 ? -r : r;
}

export function probToAmerican(p) {
  p = Math.min(0.97, Math.max(0.001, p));
  const raw = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  return roundOdds(raw);
}

export function suggestOddsFromScores(scores, overround = 1.3) {
  const w = scores.map((s) => Math.max(s, 0.01) ** 1.6);
  const total = w.reduce((a, b) => a + b, 0) || 1;
  // futures: keep even a runaway favorite around -400 at most
  return w.map((x) => probToAmerican(Math.min(0.8, (x / total) * overround)));
}

/** Rough moneyline suggestion from a point spread (home spread, e.g. -7). */
export function moneylineFromSpread(homeSpread) {
  const s = Number(homeSpread);
  if (!Number.isFinite(s)) return null;
  // logistic approximation of win probability from spread
  const pHome = 1 / (1 + Math.exp(s / 6.5));
  const vig = 0.025;
  return { home: probToAmerican(pHome + vig), away: probToAmerican(1 - pHome + vig) };
}

export const fmtOdds = (o) => (o == null || o === '' ? '—' : Number(o) > 0 ? `+${Number(o)}` : `${Number(o)}`);
export const fmtLine = (l) => (l == null || l === '' ? '—' : Number(l) > 0 ? `+${Number(l)}` : Number(l) === 0 ? 'PK' : `${Number(l)}`);

/* ---------------------------------------------------------------- *
 * Names
 * ---------------------------------------------------------------- */
export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
