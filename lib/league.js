// MCAA Sports — league engine (fake currency only: "coins").
// Runtime-agnostic: used by the Node server (server.js) and the Cloudflare Worker (worker.js).
//
// store = {
//   load(): Promise<object|null>,            save(db): Promise<void>,
//   putLogo(name, base64): Promise<void>,    getLogo(name): Promise<string|null>,
//   deleteLogos(prefix): Promise<void>,      listLogos(): Promise<{name, data}[]>,
// }
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  STATS, AWARD_BY_KEY, statsForPositions, statValue, sumStats, isValidOdds, payoutFor,
  normName, parsePositions, normalizeClass, fmtOdds, fmtLine,
} from '../public/js/shared.js';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;

export function emptyDb() {
  return {
    version: 1,
    settings: { startingBalance: 1000, currentSeason: String(new Date().getFullYear()), currentWeek: null, maxBet: 0, minBet: 1, exactScoreOdds: 2500 },
    users: [],
    sessions: {},
    teams: [],
    players: [],
    games: [],
    props: [],
    awards: [],
    specials: [],
    bets: [],
    ledger: [],
    stats: { playerGame: {}, playerSeason: {}, teamSeason: {}, teamGame: {} },
  };
}

function normalizeDb(input) {
  const base = emptyDb();
  const out = input && typeof input === 'object' ? input : base;
  for (const k of Object.keys(base)) if (out[k] == null) out[k] = base[k];
  out.settings = { ...base.settings, ...out.settings };
  out.stats = { ...base.stats, ...out.stats };
  return out;
}

export async function createLeague({ store, ownerUsername = '' }) {
let db = normalizeDb(await store.load());
let dirty = false;
function save() { dirty = true; }
async function persist() {
  if (!dirty) return;
  dirty = false;
  await store.save(db);
}

const uid = () => crypto.randomBytes(6).toString('base64url');
const now = () => new Date().toISOString();
/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (what = 'Not found') => new HttpError(404, what);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
const PBKDF2_ITER = 60000;
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 32, 'sha256').toString('hex');
  return { salt, hash, algo: 'pbkdf2' };
}
function checkPassword(user, password) {
  const hash = user.algo === 'pbkdf2'
    ? crypto.pbkdf2Sync(password, user.salt, PBKDF2_ITER, 32, 'sha256').toString('hex')
    : crypto.scryptSync(password, user.salt, 64).toString('hex'); // accounts made by older versions
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, created: Date.now(), seen: Date.now() };
  return token;
}
function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const s = db.sessions[token];
  if (!s) return null;
  if (Date.now() - s.seen > SESSION_TTL) { delete db.sessions[token]; save(); return null; }
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) { delete db.sessions[token]; return null; }
  if (Date.now() - s.seen > 60_000) { s.seen = Date.now(); user.lastSeen = now(); save(); }
  req.token = token;
  return user;
}
const publicUser = (u) => ({ id: u.id, username: u.username, balance: u.balance, isAdmin: !!u.isAdmin, isOwner: !!u.isOwner, createdAt: u.createdAt });

const attempts = new Map();
function rateLimit(key, max = 15, windowMs = 10 * 60 * 1000) {
  const t = Date.now();
  const list = (attempts.get(key) || []).filter((x) => t - x < windowMs);
  if (list.length >= max) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  list.push(t);
  attempts.set(key, list);
}

function validUsername(u) {
  return typeof u === 'string' && /^[A-Za-z0-9_.\-]{3,20}$/.test(u);
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */
function adjustBalance(user, amount, reason, ref = null) {
  user.balance = Math.round((user.balance + amount) * 100) / 100;
  db.ledger.push({ id: uid(), userId: user.id, amount, reason, ref, balance: user.balance, at: now() });
  if (db.ledger.length > 50000) db.ledger.splice(0, db.ledger.length - 50000);
}

/** Settle (or re-settle) a bet. outcome: won | lost | push | void */
function settleBet(bet, outcome) {
  if (bet.status !== 'open') unsettleBet(bet);
  const user = db.users.find((u) => u.id === bet.userId);
  bet.status = outcome;
  bet.settledAt = now();
  if (!user) return;
  if (outcome === 'won') { bet.returned = bet.payout; adjustBalance(user, bet.payout, 'Bet won', bet.id); }
  else if (outcome === 'push' || outcome === 'void') { bet.returned = bet.stake; adjustBalance(user, bet.stake, outcome === 'push' ? 'Bet push (refund)' : 'Bet voided (refund)', bet.id); }
  else bet.returned = 0;
}
function unsettleBet(bet) {
  if (bet.status === 'open') return;
  const user = db.users.find((u) => u.id === bet.userId);
  if (user && bet.returned) adjustBalance(user, -bet.returned, 'Settlement corrected', bet.id);
  bet.status = 'open';
  bet.returned = 0;
  bet.settledAt = null;
}

function gradeGameBet(bet, g) {
  const h = g.homeScore, a = g.awayScore;
  const cmp = (x, y) => (x > y ? 'won' : x < y ? 'lost' : 'push');
  switch (bet.market) {
    case 'ml': return bet.pick === 'home' ? cmp(h, a) : cmp(a, h);
    case 'spread': return bet.pick === 'home' ? cmp(h + bet.line, a) : cmp(a + bet.line, h);
    case 'total': return bet.pick === 'over' ? cmp(h + a, bet.line) : cmp(bet.line, h + a);
    case 'homeTotal': return bet.pick === 'over' ? cmp(h, bet.line) : cmp(bet.line, h);
    case 'awayTotal': return bet.pick === 'over' ? cmp(a, bet.line) : cmp(bet.line, a);
    case 'exact': return bet.exact && bet.exact.home === h && bet.exact.away === a ? 'won' : 'lost';
    default: return null;
  }
}
const GAME_MARKETS = ['ml', 'spread', 'total', 'homeTotal', 'awayTotal', 'exact'];

function settleGame(g) {
  for (const bet of db.bets) {
    if (bet.gameId !== g.id || !GAME_MARKETS.includes(bet.market)) continue;
    const outcome = gradeGameBet(bet, g);
    if (outcome) settleBet(bet, outcome);
  }
}

function settleProp(prop) {
  for (const bet of db.bets) {
    if (bet.propId !== prop.id) continue;
    if (prop.status === 'void') { settleBet(bet, 'void'); continue; }
    if (prop.result == null) { if (bet.status !== 'open') unsettleBet(bet); continue; }
    const r = prop.result;
    const outcome = r === bet.line ? 'push' : (bet.pick === 'over') === (r > bet.line) ? 'won' : 'lost';
    settleBet(bet, outcome);
  }
}

function settleSpecial(sp) {
  for (const bet of db.bets) {
    if (bet.specialId !== sp.id) continue;
    if (sp.status === 'void') settleBet(bet, 'void');
    else if (sp.winnerId) settleBet(bet, bet.pick === sp.winnerId ? 'won' : 'lost');
    else if (bet.status !== 'open') unsettleBet(bet);
  }
}

function settleAward(award) {
  for (const bet of db.bets) {
    if (bet.awardId !== award.id) continue;
    if (award.status === 'void') settleBet(bet, 'void');
    else if (award.winnerId) settleBet(bet, bet.pick === award.winnerId ? 'won' : 'lost');
    else if (bet.status !== 'open') unsettleBet(bet);
  }
}

/* ------------------------------------------------------------------ *
 * Lookups & derived data
 * ------------------------------------------------------------------ */
const team = (id) => db.teams.find((t) => t.id === id);
const player = (id) => db.players.find((p) => p.id === id);
const game = (id) => db.games.find((g) => g.id === id);
const teamName = (id) => team(id)?.name || 'TBD';

function mustGame(id) { const g = game(id); if (!g) throw notFound('Game not found'); return g; }

function seasonPlayerStats(season) {
  const out = {};
  const perPlayer = {};
  for (const g of db.games) {
    if (String(g.season) !== String(season)) continue;
    const box = db.stats.playerGame[g.id];
    if (!box) continue;
    for (const [pid, s] of Object.entries(box)) (perPlayer[pid] ||= []).push(s);
  }
  for (const [pid, list] of Object.entries(perPlayer)) out[pid] = { ...sumStats(list), gp: list.length };
  const imported = db.stats.playerSeason[season] || {};
  for (const [pid, s] of Object.entries(imported)) out[pid] = { ...(out[pid] || {}), ...s };
  return out;
}

function seasonTeamStats(season) {
  const out = {};
  for (const g of db.games) {
    if (String(g.season) !== String(season) || g.status !== 'final') continue;
    for (const [tid, pf, pa] of [[g.homeId, g.homeScore, g.awayScore], [g.awayId, g.awayScore, g.homeScore]]) {
      const r = (out[tid] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
      r.pf += pf; r.pa += pa;
      if (pf > pa) r.w++; else if (pf < pa) r.l++; else r.t++;
    }
  }
  const imported = db.stats.teamSeason[season] || {};
  for (const [tid, s] of Object.entries(imported)) out[tid] = { ...(out[tid] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 }), custom: s };
  return out;
}

function betDescription(bet) {
  const g = bet.gameId ? game(bet.gameId) : null;
  const home = g ? teamName(g.homeId) : '', away = g ? teamName(g.awayId) : '';
  switch (bet.market) {
    case 'ml': return `${bet.pick === 'home' ? home : away} Moneyline`;
    case 'spread': return `${bet.pick === 'home' ? home : away} ${fmtLine(bet.line)}`;
    case 'total': return `${bet.pick === 'over' ? 'Over' : 'Under'} ${bet.line} total points`;
    case 'homeTotal': return `${home} team total ${bet.pick === 'over' ? 'Over' : 'Under'} ${bet.line}`;
    case 'awayTotal': return `${away} team total ${bet.pick === 'over' ? 'Over' : 'Under'} ${bet.line}`;
    case 'exact': return `Exact score: ${away} ${bet.exact.away} – ${home} ${bet.exact.home}`;
    case 'prop': {
      const pr = db.props.find((x) => x.id === bet.propId);
      if (!pr) return 'Prop';
      const what = pr.kind === 'player' ? `${player(pr.playerId)?.name || 'Player'} ${STATS[pr.stat]?.label || pr.stat}` : pr.label;
      return `${what} ${bet.pick === 'over' ? 'Over' : 'Under'} ${bet.line}`;
    }
    case 'special': {
      const sp = db.specials.find((x) => x.id === bet.specialId);
      const opt = sp?.options.find((o) => o.id === bet.pick);
      return sp ? `${sp.question} — ${opt?.label || 'Pick'}` : 'Special bet';
    }
    case 'award': {
      const a = db.awards.find((x) => x.id === bet.awardId);
      return `${player(bet.pick)?.name || 'Player'} to win ${a ? AWARD_BY_KEY[a.key]?.name || a.key : 'award'}`;
    }
  }
  return bet.market;
}

/* ------------------------------------------------------------------ *
 * Validation helpers
 * ------------------------------------------------------------------ */
const str = (v, max = 120) => (v == null ? '' : String(v).trim().slice(0, max));
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function oddsOrNull(v, label) {
  if (v === '' || v == null) return null;
  const x = Number(v);
  if (!isValidOdds(x)) throw bad(`${label}: odds must be American format like -110 or +150`);
  return x;
}
function cleanColor(c, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback;
}

function cleanLines(input = {}) {
  const out = {};
  if (input.ml && (input.ml.home != null && input.ml.home !== '' || input.ml.away != null && input.ml.away !== '')) {
    out.ml = { home: oddsOrNull(input.ml.home, 'Moneyline home'), away: oddsOrNull(input.ml.away, 'Moneyline away') };
  }
  if (input.spread && numOrNull(input.spread.home) != null) {
    out.spread = { home: numOrNull(input.spread.home), homeOdds: oddsOrNull(input.spread.homeOdds ?? -110, 'Spread') ?? -110, awayOdds: oddsOrNull(input.spread.awayOdds ?? -110, 'Spread') ?? -110 };
  }
  for (const k of ['total', 'homeTotal', 'awayTotal']) {
    const t = input[k];
    if (t && numOrNull(t.line) != null) {
      out[k] = { line: numOrNull(t.line), over: oddsOrNull(t.over ?? -110, 'Over') ?? -110, under: oddsOrNull(t.under ?? -110, 'Under') ?? -110 };
    }
  }
  if (input.exact && input.exact.odds != null && input.exact.odds !== '') {
    out.exact = { odds: oddsOrNull(input.exact.odds, 'Exact score') };
  }
  return out;
}

function cleanGame(input, existing = {}) {
  const g = { ...existing };
  if ('homeId' in input) g.homeId = input.homeId;
  if ('awayId' in input) g.awayId = input.awayId;
  if (!team(g.homeId) || !team(g.awayId)) throw bad('Pick both teams');
  if (g.homeId === g.awayId) throw bad('A team cannot play itself');
  if ('season' in input || !g.season) g.season = str(input.season, 20) || db.settings.currentSeason;
  if ('week' in input) g.week = str(input.week, 30) || '1';
  if (!g.week) g.week = '1';
  for (const k of ['date', 'time', 'location', 'broadcast', 'note']) if (k in input) g[k] = str(input[k], 80);
  if ('neutral' in input) g.neutral = !!input.neutral;
  return g;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
};
const auth = { auth: true };
const admin = { auth: true, admin: true };

/* ---------- auth ---------- */
route('POST', '/api/register', async ({ body, req }) => {
  rateLimit('reg:' + req.ip, 10);
  const username = str(body.username, 20);
  const password = String(body.password || '');
  if (!validUsername(username)) throw bad('Username must be 3–20 characters (letters, numbers, _ . -)');
  if (password.length < 6) throw bad('Password must be at least 6 characters');
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw bad('That username is taken');
  // The first account becomes the league owner (admin). Set OWNER_USERNAME to reserve that for a specific name.
  const ownerName = String(ownerUsername || '').trim().toLowerCase();
  const first = !db.users.some((u) => u.isOwner) && (ownerName ? username.toLowerCase() === ownerName : db.users.length === 0);
  const { salt, hash, algo } = hashPassword(password);
  const user = { id: uid(), username, salt, hash, algo, balance: 0, isAdmin: first, isOwner: first, createdAt: now(), lastSeen: now() };
  db.users.push(user);
  adjustBalance(user, Number(db.settings.startingBalance) || 0, 'Welcome bonus');
  const token = newSession(user);
  save();
  return { token, user: publicUser(user) };
});

route('POST', '/api/login', async ({ body, req }) => {
  rateLimit('login:' + req.ip, 20);
  const username = str(body.username, 40).toLowerCase();
  const user = db.users.find((u) => u.username.toLowerCase() === username);
  if (!user || !checkPassword(user, String(body.password || ''))) throw new HttpError(401, 'Wrong username or password');
  user.lastSeen = now();
  const token = newSession(user);
  save();
  return { token, user: publicUser(user) };
});

route('POST', '/api/logout', async ({ req }) => { delete db.sessions[req.token]; save(); return { ok: true }; }, auth);
route('GET', '/api/me', async ({ user }) => ({ user: publicUser(user) }), auth);
route('POST', '/api/me/password', async ({ user, body }) => {
  if (!checkPassword(user, String(body.current || ''))) throw bad('Current password is wrong');
  if (String(body.password || '').length < 6) throw bad('New password must be at least 6 characters');
  Object.assign(user, hashPassword(String(body.password)));
  save();
  return { ok: true };
}, auth);

/* ---------- public data ---------- */
route('GET', '/api/bootstrap', async ({ user }) => {
  return {
    user: publicUser(user),
    settings: db.settings,
    teams: db.teams,
    players: db.players,
    games: db.games,
    props: db.props,
    awards: db.awards,
    specials: db.specials,
    seasons: [...new Set([db.settings.currentSeason, ...db.games.map((g) => String(g.season))])].sort().reverse(),
  };
}, auth);

route('GET', '/api/stats', async ({ query }) => {
  const season = query.get('season') || db.settings.currentSeason;
  return { season, players: seasonPlayerStats(season), teams: seasonTeamStats(season) };
}, auth);

route('GET', '/api/games/:id/box', async ({ params }) => {
  const g = mustGame(params.id);
  return { gameId: g.id, players: db.stats.playerGame[g.id] || {}, teams: db.stats.teamGame[g.id] || {} };
}, auth);

route('GET', '/api/bets', async ({ user }) => {
  const bets = db.bets.filter((b) => b.userId === user.id).map((b) => ({ ...b, desc: betDescription(b) }));
  return { bets: bets.reverse() };
}, auth);

route('GET', '/api/ledger', async ({ user }) => ({ ledger: db.ledger.filter((l) => l.userId === user.id).slice(-200).reverse() }), auth);

route('GET', '/api/leaderboard', async () => {
  const rows = db.users.map((u) => {
    const bets = db.bets.filter((b) => b.userId === u.id);
    const settled = bets.filter((b) => b.status === 'won' || b.status === 'lost');
    const won = settled.filter((b) => b.status === 'won').length;
    const profit = bets.filter((b) => b.status !== 'open').reduce((s, b) => s + (b.returned || 0) - b.stake, 0);
    const atRisk = bets.filter((b) => b.status === 'open').reduce((s, b) => s + b.stake, 0);
    return { username: u.username, balance: u.balance, atRisk, won, lost: settled.length - won, profit: Math.round(profit), isAdmin: !!u.isAdmin };
  });
  rows.sort((a, b) => (b.balance + b.atRisk) - (a.balance + a.atRisk));
  return { rows };
}, auth);

route('GET', '/api/game-bets/:id', async ({ params }) => {
  // public betting trends for a game (counts only, no usernames)
  const bets = db.bets.filter((b) => b.gameId === params.id);
  const trend = {};
  for (const b of bets) {
    const key = `${b.market}:${b.pick}`;
    trend[key] = (trend[key] || 0) + 1;
  }
  return { count: bets.length, handle: bets.reduce((s, b) => s + b.stake, 0), trend };
}, auth);

/* ---------- placing bets ---------- */
function resolveSelection(sel) {
  // returns { market, gameId, propId, awardId, pick, line, odds, exact }
  const market = sel.market;
  if (market === 'special') {
    const sp = db.specials.find((x) => x.id === sel.specialId);
    if (!sp) throw bad('That special bet no longer exists');
    if (sp.status !== 'open' || sp.locked) throw bad('Betting is closed on: ' + sp.question);
    const opt = sp.options.find((o) => o.id === sel.pick);
    if (!opt) throw bad('That answer is no longer available');
    return { market, specialId: sp.id, pick: opt.id, line: null, odds: opt.odds };
  }
  if (market === 'award') {
    const a = db.awards.find((x) => x.id === sel.awardId);
    if (!a) throw bad('Award market not found');
    if (a.status !== 'open' || a.locked) throw bad(`${AWARD_BY_KEY[a.key]?.name || 'Award'} betting is closed`);
    const entry = a.entries.find((e) => e.playerId === sel.pick);
    if (!entry) throw bad('That player is not on the board');
    return { market, awardId: a.id, pick: entry.playerId, line: null, odds: entry.odds };
  }
  if (market === 'prop') {
    const pr = db.props.find((x) => x.id === sel.propId);
    if (!pr) throw bad('Prop not found');
    if (pr.status !== 'open' || pr.result != null) throw bad('That prop is closed');
    const g = mustGame(pr.gameId);
    if (g.locked || g.status !== 'scheduled') throw bad('Betting is locked for this game');
    if (pr.locked) throw bad('That prop is locked');
    if (!['over', 'under'].includes(sel.pick)) throw bad('Pick over or under');
    return { market, gameId: g.id, propId: pr.id, pick: sel.pick, line: pr.line, odds: sel.pick === 'over' ? pr.over : pr.under };
  }
  const g = mustGame(sel.gameId);
  if (g.locked || g.status !== 'scheduled') throw bad('Betting is locked for this game');
  const L = g.lines || {};
  switch (market) {
    case 'ml':
      if (!L.ml || !['home', 'away'].includes(sel.pick) || L.ml[sel.pick] == null) throw bad('Moneyline not available');
      return { market, gameId: g.id, pick: sel.pick, line: null, odds: L.ml[sel.pick] };
    case 'spread':
      if (!L.spread || !['home', 'away'].includes(sel.pick)) throw bad('Spread not available');
      return { market, gameId: g.id, pick: sel.pick, line: sel.pick === 'home' ? L.spread.home : -L.spread.home, odds: sel.pick === 'home' ? L.spread.homeOdds : L.spread.awayOdds };
    case 'total': case 'homeTotal': case 'awayTotal':
      if (!L[market] || !['over', 'under'].includes(sel.pick)) throw bad('Total not available');
      return { market, gameId: g.id, pick: sel.pick, line: L[market].line, odds: L[market][sel.pick] };
    case 'exact': {
      if (!L.exact) throw bad('Exact score not available');
      const h = Number(sel.exact?.home), a = Number(sel.exact?.away);
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 300 || a > 300) throw bad('Enter a valid exact score');
      return { market, gameId: g.id, pick: 'exact', line: null, odds: L.exact.odds, exact: { home: h, away: a } };
    }
  }
  throw bad('Unknown bet type');
}

route('POST', '/api/bets', async ({ user, body }) => {
  const list = Array.isArray(body.bets) ? body.bets : [];
  if (!list.length) throw bad('Your bet slip is empty');
  if (list.length > 25) throw bad('Too many bets at once');
  const resolved = [];
  const changed = [];
  let total = 0;
  for (const sel of list) {
    const stake = Number(sel.stake);
    if (!Number.isInteger(stake) || stake < (db.settings.minBet || 1)) throw bad(`Minimum bet is ${db.settings.minBet || 1} coins (whole coins only)`);
    if (db.settings.maxBet > 0 && stake > db.settings.maxBet) throw bad(`Maximum bet is ${db.settings.maxBet} coins`);
    const r = resolveSelection(sel);
    if (r.odds == null) throw bad('Odds not available');
    if (Number(sel.odds) !== r.odds || (r.line != null && Number(sel.line) !== r.line)) changed.push({ key: sel.key, odds: r.odds, line: r.line });
    total += stake;
    resolved.push({ ...r, stake });
  }
  if (changed.length) return { status: 409, body: { error: 'Some odds changed. Review your slip and try again.', changed } };
  if (total > user.balance) throw bad(`Not enough coins. You have ${user.balance}, slip total is ${total}.`);
  const created = [];
  for (const r of resolved) {
    const bet = { id: uid(), userId: user.id, ...r, payout: payoutFor(r.stake, r.odds), status: 'open', returned: 0, createdAt: now(), settledAt: null };
    db.bets.push(bet);
    adjustBalance(user, -r.stake, 'Bet placed', bet.id);
    created.push({ ...bet, desc: betDescription(bet) });
  }
  save();
  return { bets: created, user: publicUser(user) };
}, auth);

/* ---------- admin: teams ---------- */
function upsertTeam(input) {
  const name = str(input.name, 60);
  if (!name) throw bad('Team name is required');
  let t = input.id ? team(input.id) : null;
  if (input.id && !t) throw notFound('Team not found');
  const dupe = db.teams.find((x) => x.id !== t?.id && normName(x.name) === normName(name));
  if (dupe) { if (input.mergeDupes) t = dupe; else throw bad(`Team "${name}" already exists`); }
  if (!t) { t = { id: uid(), createdAt: now() }; db.teams.push(t); }
  t.name = name;
  t.abbr = str(input.abbr, 6).toUpperCase() || t.abbr || name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  if ('mascot' in input || !t.mascot) t.mascot = str(input.mascot, 40);
  if ('conference' in input || !t.conference) t.conference = str(input.conference, 40);
  t.color = cleanColor(input.color, t.color || '#22c55e');
  t.color2 = cleanColor(input.color2, t.color2 || '#0f172a');
  if ('rating' in input) t.rating = clampRating(input.rating);
  return t;
}
const clampRating = (v) => { const x = Number(v); return Number.isFinite(x) ? Math.max(-50, Math.min(50, Math.round(x * 10) / 10)) : 0; };

route('POST', '/api/admin/teams', async ({ body }) => { const t = upsertTeam(body); save(); return { team: t }; }, admin);
route('POST', '/api/admin/teams/bulk', async ({ body }) => {
  const out = [];
  for (const t of body.teams || []) out.push(upsertTeam({ ...t, mergeDupes: true }));
  save();
  return { teams: out };
}, admin);
// power ratings used by the odds helper: { ratings: { teamId: number } }
route('POST', '/api/admin/teams/ratings', async ({ body }) => {
  let n = 0;
  for (const [id, v] of Object.entries(body.ratings || {})) { const t = team(id); if (t) { t.rating = clampRating(v); n++; } }
  save();
  return { updated: n };
}, admin);

route('DELETE', '/api/admin/teams/:id', async ({ params }) => {
  const t = team(params.id);
  if (!t) throw notFound();
  if (db.games.some((g) => g.homeId === t.id || g.awayId === t.id)) throw bad('This team has games scheduled. Delete those games first.');
  db.teams = db.teams.filter((x) => x.id !== t.id);
  db.players = db.players.filter((p) => p.teamId !== t.id);
  await store.deleteLogos(t.id + '.');
  save();
  return { ok: true };
}, admin);

route('POST', '/api/admin/teams/:id/logo', async ({ params, body }) => {
  const t = team(params.id);
  if (!t) throw notFound();
  const m = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,(.+)$/.exec(body.dataUrl || '');
  if (!m) throw bad('Upload a PNG, JPG, WEBP, GIF or SVG image');
  const ext = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' }[m[1]];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.4 * 1024 * 1024) throw bad('Logo must be under 1.4 MB — try a smaller image');
  if (ext === 'svg' && /<script|on\w+=|javascript:/i.test(buf.toString('utf8'))) throw bad('That SVG contains scripts');
  await store.deleteLogos(t.id + '.');
  await store.putLogo(`${t.id}.${ext}`, m[2]);
  t.logo = `/logos/${t.id}.${ext}?v=${Date.now().toString(36)}`;
  save();
  return { team: t };
}, admin);
route('DELETE', '/api/admin/teams/:id/logo', async ({ params }) => {
  const t = team(params.id);
  if (!t) throw notFound();
  await store.deleteLogos(t.id + '.');
  t.logo = null;
  save();
  return { team: t };
}, admin);

/* ---------- admin: players ---------- */
function upsertPlayer(input, { merge = true } = {}) {
  const name = str(input.name, 60);
  if (!name) throw bad('Player name is required');
  const teamId = input.teamId;
  if (!team(teamId)) throw bad(`Unknown team for ${name}`);
  let positions = Array.isArray(input.positions) ? input.positions : parsePositions(input.positions);
  positions = positions.map((p) => String(p).toUpperCase()).filter(Boolean);
  const cls = normalizeClass(input.cls) || (input.cls ? str(input.cls, 8).toUpperCase() : null);
  const number = input.number === '' || input.number == null ? null : str(input.number, 3).replace(/^#/, '');
  let p = input.id ? player(input.id) : null;
  if (input.id && !p) throw notFound('Player not found');
  if (!p && merge) p = db.players.find((x) => x.teamId === teamId && normName(x.name) === normName(name));
  let created = false;
  if (!p) { p = { id: uid(), positions: [], createdAt: now() }; db.players.push(p); created = true; }
  p.name = name;
  p.teamId = teamId;
  if (input.id || created) p.positions = positions;
  else for (const pos of positions) if (!p.positions.includes(pos)) p.positions.push(pos); // same player listed twice => merge positions
  if (cls || input.id) p.cls = cls;
  if (number != null || input.id) p.number = number;
  return { player: p, created };
}

route('POST', '/api/admin/players', async ({ body }) => {
  const r = upsertPlayer(body);
  save();
  return r;
}, admin);
route('POST', '/api/admin/players/bulk', async ({ body }) => {
  let created = 0, updated = 0;
  for (const row of body.players || []) {
    const r = upsertPlayer({ ...row, id: undefined });
    r.created ? created++ : updated++;
  }
  if (body.replaceTeamId) {
    const keep = new Set((body.players || []).map((r) => normName(r.name)));
    db.players = db.players.filter((p) => p.teamId !== body.replaceTeamId || keep.has(normName(p.name)));
  }
  save();
  return { created, updated };
}, admin);
route('DELETE', '/api/admin/players/:id', async ({ params }) => {
  const p = player(params.id);
  if (!p) throw notFound();
  const openProps = db.props.filter((pr) => pr.playerId === p.id && pr.status === 'open');
  for (const pr of openProps) { pr.status = 'void'; settleProp(pr); }
  db.players = db.players.filter((x) => x.id !== p.id);
  save();
  return { ok: true };
}, admin);

/* ---------- admin: games ---------- */
route('POST', '/api/admin/games', async ({ body }) => {
  let g;
  if (body.id) {
    const existing = mustGame(body.id);
    g = cleanGame(body, existing);
    Object.assign(existing, g);
    g = existing;
  } else {
    g = cleanGame(body, { id: uid(), status: 'scheduled', locked: false, lines: {}, createdAt: now() });
    if (body.lines) g.lines = cleanLines(body.lines);
    db.games.push(g);
  }
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/games/bulk', async ({ body }) => {
  const created = [];
  for (const row of body.games || []) {
    const g = cleanGame(row, { id: uid(), status: 'scheduled', locked: false, lines: {}, createdAt: now() });
    if (row.lines) g.lines = cleanLines(row.lines);
    const hs = Number(row.homeScore), as = Number(row.awayScore);
    if (row.homeScore != null && row.awayScore != null && Number.isInteger(hs) && Number.isInteger(as) && hs >= 0 && as >= 0) {
      Object.assign(g, { homeScore: hs, awayScore: as, status: 'final', locked: true, finalAt: now() });
    }
    db.games.push(g);
    created.push(g);
  }
  save();
  return { created: created.length };
}, admin);

route('DELETE', '/api/admin/games/:id', async ({ params }) => {
  const g = mustGame(params.id);
  for (const b of db.bets) if (b.gameId === g.id && b.status === 'open') settleBet(b, 'void');
  db.games = db.games.filter((x) => x.id !== g.id);
  db.props = db.props.filter((p) => p.gameId !== g.id);
  delete db.stats.playerGame[g.id];
  save();
  return { ok: true };
}, admin);

route('POST', '/api/admin/games/:id/lines', async ({ params, body }) => {
  const g = mustGame(params.id);
  g.lines = cleanLines(body.lines || {});
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/lines/bulk', async ({ body }) => {
  const items = body.items || [];
  const cleaned = items.map((it) => [mustGame(it.gameId), cleanLines(it.lines || {})]);
  for (const [g, l] of cleaned) g.lines = l;
  save();
  return { updated: cleaned.length };
}, admin);

route('POST', '/api/admin/games/:id/lock', async ({ params, body }) => {
  const g = mustGame(params.id);
  g.locked = !!body.locked;
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/games/lock-week', async ({ body }) => {
  let n = 0;
  for (const g of db.games) {
    if (String(g.season) === String(body.season) && String(g.week) === String(body.week) && g.status === 'scheduled') { g.locked = !!body.locked; n++; }
  }
  save();
  return { updated: n };
}, admin);

route('POST', '/api/admin/games/:id/gotw', async ({ params, body }) => {
  const g = mustGame(params.id);
  if (body.on) for (const x of db.games) if (x.season === g.season && String(x.week) === String(g.week)) x.gotw = false;
  g.gotw = !!body.on;
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/games/:id/final', async ({ params, body }) => {
  const g = mustGame(params.id);
  const h = Number(body.homeScore), a = Number(body.awayScore);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) throw bad('Enter whole-number scores');
  g.homeScore = h; g.awayScore = a; g.status = 'final'; g.locked = true; g.finalAt = now();
  settleGame(g);
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/finals/bulk', async ({ body }) => {
  let n = 0;
  for (const it of body.items || []) {
    const g = mustGame(it.gameId);
    const h = Number(it.homeScore), a = Number(it.awayScore);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) throw bad(`Bad score for ${teamName(g.awayId)} @ ${teamName(g.homeId)}`);
    g.homeScore = h; g.awayScore = a; g.status = 'final'; g.locked = true; g.finalAt = now();
    settleGame(g);
    n++;
  }
  save();
  return { updated: n };
}, admin);

route('POST', '/api/admin/games/:id/reopen', async ({ params }) => {
  const g = mustGame(params.id);
  for (const b of db.bets) if (b.gameId === g.id && GAME_MARKETS.includes(b.market)) unsettleBet(b);
  g.status = 'scheduled'; g.homeScore = null; g.awayScore = null; g.locked = true;
  save();
  return { game: g };
}, admin);

route('POST', '/api/admin/games/:id/cancel', async ({ params }) => {
  const g = mustGame(params.id);
  for (const b of db.bets) if (b.gameId === g.id) settleBet(b, 'void');
  for (const p of db.props) if (p.gameId === g.id) p.status = 'void';
  g.status = 'cancelled'; g.locked = true;
  save();
  return { game: g };
}, admin);

/* ---------- admin: props ---------- */
route('POST', '/api/admin/props', async ({ body }) => {
  const g = mustGame(body.gameId);
  let pr = body.id ? db.props.find((x) => x.id === body.id) : null;
  if (body.id && !pr) throw notFound('Prop not found');
  const kind = body.kind === 'game' ? 'game' : 'player';
  const line = numOrNull(body.line);
  if (line == null) throw bad('Enter a line (e.g. 74.5)');
  const over = oddsOrNull(body.over ?? -110, 'Over') ?? -110;
  const under = oddsOrNull(body.under ?? -110, 'Under') ?? -110;
  const data = { gameId: g.id, kind, line, over, under };
  if (kind === 'player') {
    const p = player(body.playerId);
    if (!p) throw bad('Pick a player');
    if (p.teamId !== g.homeId && p.teamId !== g.awayId) throw bad(`${p.name} is not on either team in this game`);
    if (!STATS[body.stat]) throw bad('Pick a stat');
    if (!statsForPositions(p.positions).includes(body.stat)) throw bad(`${STATS[body.stat].label} is not available for a ${p.positions.join('/') || 'player with no position'}`);
    Object.assign(data, { playerId: p.id, stat: body.stat, label: null });
  } else {
    const label = str(body.label, 80);
    if (!label) throw bad('Describe the stat (e.g. "Total turnovers")');
    Object.assign(data, { label, playerId: null, stat: null });
  }
  if (!pr) { pr = { id: uid(), status: 'open', result: null, createdAt: now() }; db.props.push(pr); }
  Object.assign(pr, data);
  save();
  return { prop: pr };
}, admin);

route('POST', '/api/admin/props/bulk', async ({ body }) => {
  // quick create many player props: items [{gameId, playerId, stat, line, over, under}]
  let n = 0;
  for (const it of body.items || []) {
    const g = mustGame(it.gameId);
    const p = player(it.playerId);
    if (!p || !STATS[it.stat] || numOrNull(it.line) == null) continue;
    if (!statsForPositions(p.positions).includes(it.stat)) continue;
    const existing = db.props.find((x) => x.gameId === g.id && x.playerId === p.id && x.stat === it.stat && x.status === 'open');
    const data = { gameId: g.id, kind: 'player', playerId: p.id, stat: it.stat, line: numOrNull(it.line), over: oddsOrNull(it.over ?? -110, 'Over') ?? -110, under: oddsOrNull(it.under ?? -110, 'Under') ?? -110, label: null };
    if (existing) Object.assign(existing, data);
    else db.props.push({ id: uid(), status: 'open', result: null, createdAt: now(), ...data });
    n++;
  }
  save();
  return { updated: n };
}, admin);

route('POST', '/api/admin/props/:id/result', async ({ params, body }) => {
  const pr = db.props.find((x) => x.id === params.id);
  if (!pr) throw notFound();
  if (body.void) { pr.status = 'void'; pr.result = null; }
  else if (body.clear) { pr.status = 'open'; pr.result = null; }
  else {
    const r = numOrNull(body.result);
    if (r == null) throw bad('Enter the result');
    pr.result = r; pr.status = 'settled';
  }
  settleProp(pr);
  save();
  return { prop: pr };
}, admin);

route('POST', '/api/admin/props/:id/lock', async ({ params, body }) => {
  const pr = db.props.find((x) => x.id === params.id);
  if (!pr) throw notFound();
  pr.locked = !!body.locked;
  save();
  return { prop: pr };
}, admin);

route('DELETE', '/api/admin/props/:id', async ({ params }) => {
  const pr = db.props.find((x) => x.id === params.id);
  if (!pr) throw notFound();
  pr.status = 'void';
  settleProp(pr);
  db.props = db.props.filter((x) => x.id !== pr.id);
  save();
  return { ok: true };
}, admin);

/* ---------- admin: stats ---------- */
function cleanStatRow(stats) {
  const out = {};
  for (const [k, v] of Object.entries(stats || {})) {
    if (!STATS[k] || STATS[k].derived) continue;
    const x = Number(v);
    if (Number.isFinite(x)) out[k] = x;
  }
  return out;
}

route('POST', '/api/admin/stats/player-game', async ({ body }) => {
  const g = mustGame(body.gameId);
  const box = (db.stats.playerGame[g.id] ||= {});
  let n = 0;
  for (const row of body.rows || []) {
    if (!player(row.playerId)) continue;
    const s = cleanStatRow(row.stats);
    box[row.playerId] = body.merge === false ? s : { ...(box[row.playerId] || {}), ...s };
    n++;
  }
  // auto-grade player props for players that now have stats
  let graded = 0;
  if (body.gradeProps !== false) {
    for (const pr of db.props) {
      if (pr.gameId !== g.id || pr.kind !== 'player' || pr.status === 'void') continue;
      if (!box[pr.playerId]) continue;
      pr.result = statValue(box[pr.playerId], pr.stat);
      pr.status = 'settled';
      settleProp(pr);
      graded++;
    }
  }
  save();
  return { updated: n, graded };
}, admin);

route('POST', '/api/admin/stats/player-season', async ({ body }) => {
  const season = str(body.season, 20) || db.settings.currentSeason;
  const bucket = (db.stats.playerSeason[season] ||= {});
  let n = 0;
  for (const row of body.rows || []) {
    if (!player(row.playerId)) continue;
    bucket[row.playerId] = body.merge === false ? cleanStatRow(row.stats) : { ...(bucket[row.playerId] || {}), ...cleanStatRow(row.stats) };
    n++;
  }
  save();
  return { updated: n };
}, admin);

route('POST', '/api/admin/stats/team-season', async ({ body }) => {
  const season = str(body.season, 20) || db.settings.currentSeason;
  const bucket = (db.stats.teamSeason[season] ||= {});
  let n = 0;
  for (const row of body.rows || []) {
    if (!team(row.teamId)) continue;
    const s = {};
    for (const [k, v] of Object.entries(row.stats || {})) {
      const key = str(k, 30);
      if (!key) continue;
      const x = Number(v);
      s[key] = Number.isFinite(x) ? x : str(v, 30);
    }
    bucket[row.teamId] = { ...(bucket[row.teamId] || {}), ...s };
    n++;
  }
  save();
  return { updated: n };
}, admin);

route('POST', '/api/admin/stats/clear', async ({ body }) => {
  if (body.scope === 'game') delete db.stats.playerGame[body.gameId];
  else if (body.scope === 'playerSeason') delete db.stats.playerSeason[body.season];
  else if (body.scope === 'teamSeason') delete db.stats.teamSeason[body.season];
  save();
  return { ok: true };
}, admin);

/* ---------- admin: awards ---------- */
route('POST', '/api/admin/awards', async ({ body }) => {
  if (!AWARD_BY_KEY[body.key]) throw bad('Unknown award');
  const season = str(body.season, 20) || db.settings.currentSeason;
  let a = body.id ? db.awards.find((x) => x.id === body.id) : db.awards.find((x) => x.key === body.key && x.season === season);
  if (body.id && !a) throw notFound();
  const entries = [];
  for (const e of body.entries || []) {
    if (!player(e.playerId)) continue;
    if (entries.some((x) => x.playerId === e.playerId)) continue;
    entries.push({ playerId: e.playerId, odds: oddsOrNull(e.odds, player(e.playerId).name) });
  }
  if (entries.some((e) => e.odds == null)) throw bad('Every player on the board needs odds');
  if (!a) { a = { id: uid(), key: body.key, season, status: 'open', winnerId: null, createdAt: now() }; db.awards.push(a); }
  // removing a player with open bets => void those bets
  for (const b of db.bets) if (b.awardId === a.id && b.status === 'open' && !entries.some((e) => e.playerId === b.pick)) settleBet(b, 'void');
  a.entries = entries;
  a.locked = !!body.locked;
  save();
  return { award: a };
}, admin);

route('POST', '/api/admin/awards/:id/settle', async ({ params, body }) => {
  const a = db.awards.find((x) => x.id === params.id);
  if (!a) throw notFound();
  if (!player(body.playerId)) throw bad('Pick the winner');
  a.winnerId = body.playerId; a.status = 'settled'; a.locked = true;
  settleAward(a);
  save();
  return { award: a };
}, admin);

route('POST', '/api/admin/awards/:id/reopen', async ({ params }) => {
  const a = db.awards.find((x) => x.id === params.id);
  if (!a) throw notFound();
  a.winnerId = null; a.status = 'open';
  settleAward(a);
  save();
  return { award: a };
}, admin);

route('DELETE', '/api/admin/awards/:id', async ({ params }) => {
  const a = db.awards.find((x) => x.id === params.id);
  if (!a) throw notFound();
  a.status = 'void';
  settleAward(a);
  db.awards = db.awards.filter((x) => x.id !== a.id);
  save();
  return { ok: true };
}, admin);

/* ---------- admin: specials (any custom question: yes/no or multiple choice) ---------- */
const mustSpecial = (id) => { const sp = db.specials.find((x) => x.id === id); if (!sp) throw notFound('Special not found'); return sp; };

route('POST', '/api/admin/specials', async ({ body }) => {
  const question = str(body.question, 160);
  if (!question) throw bad('Type the question (e.g. "Will Fresno be the #1 seed?")');
  let sp = body.id ? mustSpecial(body.id) : null;
  if (sp && sp.status === 'settled') throw bad('Undo the result before editing this bet');
  const options = [];
  for (const o of body.options || []) {
    const label = str(o.label, 80);
    if (!label) continue;
    if (options.some((x) => x.label.toLowerCase() === label.toLowerCase())) throw bad(`"${label}" is listed twice`);
    const keep = sp?.options.find((x) => x.id === o.id);
    options.push({ id: keep ? keep.id : uid(), label, odds: oddsOrNull(o.odds, label), teamId: team(o.teamId) ? o.teamId : null, playerId: player(o.playerId) ? o.playerId : null });
  }
  if (options.length < 2) throw bad('Give at least two answers (like Yes and No)');
  if (options.some((o) => o.odds == null)) throw bad('Every answer needs odds (like -110 or +250)');
  if (!sp) { sp = { id: uid(), status: 'open', winnerId: null, createdAt: now() }; db.specials.push(sp); }
  // an answer that was removed => refund bets on it
  for (const b of db.bets) if (b.specialId === sp.id && b.status === 'open' && !options.some((o) => o.id === b.pick)) settleBet(b, 'void');
  Object.assign(sp, {
    question, options,
    category: str(body.category, 40),
    note: str(body.note, 140),
    teamId: team(body.teamId) ? body.teamId : null,
    season: str(body.season, 20) || sp.season || db.settings.currentSeason,
    locked: !!body.locked,
    featured: !!body.featured,
  });
  save();
  return { special: sp };
}, admin);

route('POST', '/api/admin/specials/:id/lock', async ({ params, body }) => {
  const sp = mustSpecial(params.id);
  sp.locked = !!body.locked;
  save();
  return { special: sp };
}, admin);

route('POST', '/api/admin/specials/:id/settle', async ({ params, body }) => {
  const sp = mustSpecial(params.id);
  if (!sp.options.some((o) => o.id === body.optionId)) throw bad('Pick the winning answer');
  sp.winnerId = body.optionId; sp.status = 'settled'; sp.locked = true; sp.settledAt = now();
  settleSpecial(sp);
  save();
  return { special: sp };
}, admin);

route('POST', '/api/admin/specials/:id/reopen', async ({ params }) => {
  const sp = mustSpecial(params.id);
  sp.winnerId = null; sp.status = 'open';
  settleSpecial(sp);
  save();
  return { special: sp };
}, admin);

route('DELETE', '/api/admin/specials/:id', async ({ params }) => {
  const sp = mustSpecial(params.id);
  sp.status = 'void';
  settleSpecial(sp);
  db.specials = db.specials.filter((x) => x.id !== sp.id);
  save();
  return { ok: true };
}, admin);

/* ---------- admin: users ---------- */
const mustUser = (id) => { const u = db.users.find((x) => x.id === id); if (!u) throw notFound('User not found'); return u; };

route('GET', '/api/admin/users', async () => {
  const users = db.users.map((u) => {
    const bets = db.bets.filter((b) => b.userId === u.id);
    return { ...publicUser(u), lastSeen: u.lastSeen, bets: bets.length, open: bets.filter((b) => b.status === 'open').length, atRisk: bets.filter((b) => b.status === 'open').reduce((s, b) => s + b.stake, 0) };
  });
  return { users };
}, admin);

route('GET', '/api/admin/users/:id/bets', async ({ params }) => {
  const u = mustUser(params.id);
  return {
    bets: db.bets.filter((b) => b.userId === u.id).map((b) => ({ ...b, desc: betDescription(b) })).reverse(),
    ledger: db.ledger.filter((l) => l.userId === u.id).slice(-100).reverse(),
  };
}, admin);

route('POST', '/api/admin/users/:id/balance', async ({ params, body, user: me }) => {
  const u = mustUser(params.id);
  const amt = Number(body.amount);
  if (!Number.isFinite(amt)) throw bad('Enter an amount');
  const note = str(body.note, 80);
  const delta = body.mode === 'set' ? amt - u.balance : amt;
  adjustBalance(u, Math.round(delta), `Admin adjustment by ${me.username}${note ? ': ' + note : ''}`);
  save();
  return { user: publicUser(u) };
}, admin);

route('POST', '/api/admin/users/bulk-balance', async ({ body, user: me }) => {
  const amt = Math.round(Number(body.amount));
  if (!Number.isFinite(amt)) throw bad('Enter an amount');
  for (const u of db.users) adjustBalance(u, amt, `Admin bonus by ${me.username}${body.note ? ': ' + str(body.note, 80) : ''}`);
  save();
  return { updated: db.users.length };
}, admin);

route('POST', '/api/admin/users/:id/admin', async ({ params, body }) => {
  const u = mustUser(params.id);
  if (u.isOwner && !body.isAdmin) throw bad('The league owner always stays an admin');
  u.isAdmin = !!body.isAdmin;
  save();
  return { user: publicUser(u) };
}, admin);

route('POST', '/api/admin/users/:id/password', async ({ params, body, user: me }) => {
  const u = mustUser(params.id);
  if (u.isOwner && !me.isOwner) throw bad('Only the owner can reset the owner password');
  if (String(body.password || '').length < 6) throw bad('Password must be at least 6 characters');
  Object.assign(u, hashPassword(String(body.password)));
  for (const [t, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[t];
  save();
  return { ok: true };
}, admin);

route('DELETE', '/api/admin/users/:id', async ({ params, user: me }) => {
  const u = mustUser(params.id);
  if (u.isOwner) throw bad('The owner account cannot be deleted');
  if (u.id === me.id) throw bad('You cannot delete yourself');
  db.users = db.users.filter((x) => x.id !== u.id);
  db.bets = db.bets.filter((b) => b.userId !== u.id);
  for (const [t, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[t];
  save();
  return { ok: true };
}, admin);

route('POST', '/api/admin/bets/:id/void', async ({ params }) => {
  const b = db.bets.find((x) => x.id === params.id);
  if (!b) throw notFound();
  settleBet(b, 'void');
  save();
  return { ok: true };
}, admin);

/* ---------- admin: settings & backup ---------- */
route('POST', '/api/admin/settings', async ({ body }) => {
  const s = db.settings;
  if ('startingBalance' in body) s.startingBalance = Math.max(0, Math.round(Number(body.startingBalance) || 0));
  if ('currentSeason' in body) s.currentSeason = str(body.currentSeason, 20) || s.currentSeason;
  if ('currentWeek' in body) s.currentWeek = str(body.currentWeek, 30) || null;
  if ('maxBet' in body) s.maxBet = Math.max(0, Math.round(Number(body.maxBet) || 0));
  if ('minBet' in body) s.minBet = Math.max(1, Math.round(Number(body.minBet) || 1));
  if ('exactScoreOdds' in body) s.exactScoreOdds = oddsOrNull(body.exactScoreOdds, 'Exact score odds') ?? s.exactScoreOdds;
  if ('announcement' in body) s.announcement = str(body.announcement, 200);
  save();
  return { settings: s };
}, admin);

route('GET', '/api/admin/backup', async () => {
  const logos = {};
  for (const { name, data } of await store.listLogos()) logos[name] = data;
  return { body: { ...db, sessions: {}, logos }, headers: { 'Content-Disposition': `attachment; filename="mcaa-backup-${new Date().toISOString().slice(0, 10)}.json"` } };
}, admin);

route('POST', '/api/admin/restore', async ({ body, user: me }) => {
  if (!body || !Array.isArray(body.users) || !Array.isArray(body.games) || !body.settings) throw bad('That does not look like an MCAA Sports backup file');
  const logos = body.logos || {};
  delete body.logos;
  const base = emptyDb();
  db = normalizeDb({ ...base, ...body, settings: { ...base.settings, ...body.settings }, stats: { ...base.stats, ...(body.stats || {}) }, sessions: {} });
  await store.deleteLogos('');
  for (const [f, b64] of Object.entries(logos)) {
    const name = String(f).split(/[\\/]/).pop();
    if (/^[\w-]+\.(png|jpg|webp|gif|svg)$/.test(name) && typeof b64 === 'string') await store.putLogo(name, b64);
  }
  // keep the restoring admin logged in if they exist in the backup
  const same = db.users.find((u) => u.id === me.id);
  const token = same ? newSession(same) : null;
  save();
  return { ok: true, token };
}, { auth: true, admin: true, bodyLimit: 200 * 1024 * 1024 });

/* ------------------------------------------------------------------ *
 * Dispatcher
 * ------------------------------------------------------------------ */
const LOGO_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const json = (status, data, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(data) });

/**
 * Handle one request. input = { method, pathname, search, headers (lower-case keys), readBody(): Promise<string>, ip }
 * Returns { status, headers, body (string | Uint8Array) }, or null if the path isn't ours.
 */
async function handle(input) {
  const { method, pathname } = input;
  if (pathname.startsWith('/logos/')) {
    const name = pathname.slice(7).split('/').pop();
    const ext = name.split('.').pop().toLowerCase();
    const data = LOGO_TYPES[ext] ? await store.getLogo(name) : null;
    if (!data) return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
    return { status: 200, headers: { 'Content-Type': LOGO_TYPES[ext], 'Cache-Control': 'public, max-age=31536000, immutable' }, body: new Uint8Array(Buffer.from(data, 'base64')) };
  }
  if (!pathname.startsWith('/api/')) return null;
  const r = routes.find((x) => x.method === method && x.re.test(pathname));
  if (!r) return json(404, { error: 'Not found' });
  try {
    const params = {};
    const m = r.re.exec(pathname);
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const req = { headers: input.headers, ip: input.ip || 'unknown', token: null };
    const user = getUser(req);
    if (r.opts.auth && !user) throw new HttpError(401, 'Please log in');
    if (r.opts.admin && !user.isAdmin) throw new HttpError(403, 'Admins only');
    let body = {};
    if (method !== 'GET') {
      const text = await input.readBody();
      if (text.length > (r.opts.bodyLimit || 12 * 1024 * 1024)) throw new HttpError(413, 'Upload too large');
      if (text) { try { body = JSON.parse(text); } catch { throw bad('Invalid JSON'); } }
    }
    const out = await r.handler({ req, params, body, user, query: new URLSearchParams(input.search || '') });
    await persist();
    if (out && out.status && out.body) return json(out.status, out.body);
    if (out && out.headers && out.body) return json(200, out.body, out.headers);
    return json(200, out ?? { ok: true });
  } catch (e) {
    await persist().catch(() => {});
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong on the server' });
  }
}

return {
  handle,
  persist,
  hasOwner: () => db.users.some((u) => u.isOwner),
};
}
