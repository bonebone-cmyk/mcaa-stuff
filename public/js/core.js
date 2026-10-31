// Core client utilities: API, store, DOM helpers, icons, toasts, modals.
import { STATS, fmtOdds, fmtLine } from './shared.js';

/* ---------------------------------------------------------------- API */
const TOKEN_KEY = 'mcaa_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== '/api/login') {
    setToken(null);
    window.dispatchEvent(new Event('mcaa:logout'));
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}
export class ApiError extends Error {
  constructor(msg, status, data) { super(msg); this.status = status; this.data = data; }
}
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const del = (p) => api(p, { method: 'DELETE' });

/* ---------------------------------------------------------------- Store */
export const store = {
  user: null,
  settings: {},
  teams: [],
  players: [],
  games: [],
  props: [],
  awards: [],
  seasons: [],
  stats: null, // { season, players, teams }
  myBets: null,
  slip: JSON.parse(localStorage.getItem('mcaa_slip') || '[]'),
  ui: { season: null, week: null },
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach((fn) => fn());

export const teamById = (id) => store.teams.find((t) => t.id === id);
export const playerById = (id) => store.players.find((p) => p.id === id);
export const gameById = (id) => store.games.find((g) => g.id === id);

export async function loadAll() {
  const d = await api('/api/bootstrap');
  Object.assign(store, { user: d.user, settings: d.settings, teams: d.teams, players: d.players, games: d.games, props: d.props, awards: d.awards, seasons: d.seasons });
  if (!store.ui.season || !store.seasons.includes(store.ui.season)) store.ui.season = d.settings.currentSeason;
  store.stats = null;
  store.myBets = null;
  emit();
}
export async function loadStats(season = store.ui.season, force = false) {
  if (!force && store.stats && store.stats.season === season) return store.stats;
  store.stats = await api('/api/stats?season=' + encodeURIComponent(season));
  return store.stats;
}
export async function loadMyBets(force = false) {
  if (!force && store.myBets) return store.myBets;
  store.myBets = (await api('/api/bets')).bets;
  return store.myBets;
}
export async function refreshUser() {
  const d = await api('/api/me');
  store.user = d.user;
  emit();
}

/* ---------------------------------------------------------------- Formatting */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const coins = (n) => Math.round(Number(n) || 0).toLocaleString();
export { fmtOdds, fmtLine };
export const statLabel = (k) => STATS[k]?.label || k;
export function fmtStat(k, v) {
  if (v == null || v === '') return '—';
  const d = STATS[k]?.decimals;
  const n = Number(v);
  if (!Number.isFinite(n)) return esc(v);
  return d ? n.toFixed(d) : Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}
export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + (d.length === 10 ? 'T12:00:00' : ''));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtWhen(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function ago(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
/** Sortable minutes value for free-form times like "7:00 PM", "19:30", "TBA". */
export function timeKey(t) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(t || '');
  if (!m) return 9999;
  let h = Number(m[1]) % 24;
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2] || 0);
}
export const sortGames = (a, b) => (a.date || '').localeCompare(b.date || '') || timeKey(a.time) - timeKey(b.time) || (a.createdAt || '').localeCompare(b.createdAt || '');
export const weekLabel = (w) => (/^\d+$/.test(String(w)) ? `Week ${w}` : String(w));
export function weekSort(a, b) {
  const na = Number(a), nb = Number(b);
  const ia = Number.isFinite(na), ib = Number.isFinite(nb);
  if (ia && ib) return na - nb;
  if (ia) return -1;
  if (ib) return 1;
  return String(a).localeCompare(String(b));
}

/* ---------------------------------------------------------------- Team helpers */
export function teamLogo(t, size = '') {
  if (!t) return `<div class="tlogo ${size}" style="background:#1e293b">?</div>`;
  if (t.logo) return `<div class="tlogo img ${size}"><img src="${esc(t.logo)}" alt="${esc(t.name)} logo" loading="lazy"></div>`;
  return `<div class="tlogo ${size}" style="background:linear-gradient(135deg, ${esc(t.color || '#22c55e')}, ${esc(t.color2 || '#0f172a')})">${esc((t.abbr || t.name || '?').slice(0, 4))}</div>`;
}
export function teamRecords(season) {
  const rec = {};
  for (const g of store.games) {
    if (String(g.season) !== String(season) || g.status !== 'final') continue;
    for (const [tid, pf, pa] of [[g.homeId, g.homeScore, g.awayScore], [g.awayId, g.awayScore, g.homeScore]]) {
      const r = (rec[tid] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
      r.pf += pf; r.pa += pa;
      if (pf > pa) r.w++; else if (pf < pa) r.l++; else r.t++;
    }
  }
  return rec;
}
export const recStr = (r) => (r ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : '0-0');
export function teamGradient(home, away, opacity = 1) {
  const c1 = home?.color || '#22c55e', c2 = away?.color || '#3ad7f0';
  return `background: linear-gradient(110deg, ${c2} 0%, transparent 45%, transparent 55%, ${c1} 100%); opacity:${opacity}`;
}

/* ---------------------------------------------------------------- Icons */
const P = {
  book: '<path d="M3 5a2 2 0 0 1 2-2h5v18H5a2 2 0 0 1-2-2zM14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5z"/>',
  ticket: '<path d="M3 8V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v0a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4V12a2 2 0 0 0 0-4z"/><path d="M9 5v14" stroke-dasharray="2 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5.5 7-5.5s6.2 2 7 5.5"/><circle cx="17" cy="7" r="2.5"/><path d="M17 13c2.5 0 4.4 1.5 5 4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  scale: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  whistle: '<circle cx="9" cy="14" r="6"/><path d="M13 9l8-4v4l-6 2"/>',
  wand: '<path d="M4 20L16 8M14 4v2M20 10h-2M18.5 5.5l-1.4 1.4M10 6l.5 1.5L12 8l-1.5.5L10 10l-.5-1.5L8 8l1.5-.5z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  football: '<ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)"/><path d="M9.5 14.5l5-5M10.5 11.5l2 2M12.5 9.5l2 2"/>',
};
export const icon = (name, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

export const coinSvg = (cls = 'coin') => `<svg class="${cls}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
<rect x="4" y="1" width="8" height="1" fill="#7c4a03"/><rect x="2" y="2" width="12" height="12" rx="0" fill="#7c4a03"/><rect x="1" y="4" width="14" height="8" fill="#7c4a03"/><rect x="4" y="14" width="8" height="1" fill="#7c4a03"/>
<rect x="4" y="2" width="8" height="1" fill="#fcd34d"/><rect x="3" y="3" width="10" height="10" fill="#fbbf24"/><rect x="2" y="4" width="12" height="8" fill="#fbbf24"/><rect x="4" y="13" width="8" height="1" fill="#d97706"/>
<rect x="3" y="3" width="2" height="2" fill="#fef3c7"/><rect x="2" y="5" width="1" height="3" fill="#fef3c7"/><rect x="11" y="11" width="2" height="2" fill="#d97706"/><rect x="13" y="8" width="1" height="3" fill="#d97706"/>
<rect x="7" y="4" width="2" height="8" fill="#b45309"/><rect x="6" y="5" width="4" height="1" fill="#b45309"/><rect x="6" y="10" width="4" height="1" fill="#b45309"/></svg>`;

export const trophySvg = (cls = 'trophy') => `<svg class="${cls}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
<rect x="3" y="1" width="10" height="1" fill="#fde68a"/><rect x="3" y="2" width="10" height="5" fill="#fbbf24"/><rect x="4" y="7" width="8" height="1" fill="#f59e0b"/><rect x="5" y="8" width="6" height="1" fill="#d97706"/>
<rect x="1" y="2" width="2" height="1" fill="#fbbf24"/><rect x="1" y="3" width="1" height="2" fill="#fbbf24"/><rect x="2" y="5" width="1" height="1" fill="#fbbf24"/>
<rect x="13" y="2" width="2" height="1" fill="#fbbf24"/><rect x="14" y="3" width="1" height="2" fill="#fbbf24"/><rect x="13" y="5" width="1" height="1" fill="#fbbf24"/>
<rect x="7" y="9" width="2" height="3" fill="#d97706"/><rect x="4" y="12" width="8" height="1" fill="#92400e"/><rect x="3" y="13" width="10" height="2" fill="#78350f"/>
<rect x="4" y="2" width="1" height="4" fill="#fef3c7"/><rect x="6" y="3" width="4" height="3" fill="#3ee08f"/><rect x="7" y="3" width="1" height="1" fill="#bbf7d0"/></svg>`;

/* ---------------------------------------------------------------- Toasts */
export function toast(msg, type = 'ok') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = icon(type === 'err' ? 'warn' : 'check') + `<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err');

export function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#3ee08f', '#fbbf24', '#3ad7f0', '#a78bfa', '#f87171'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.animationDuration = 1 + Math.random() * 0.9 + 's';
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}

/* ---------------------------------------------------------------- Modals */
/**
 * modal({ title, body (html), wide, actions: [{label, cls, onClick(close, root) -> bool|Promise}], onMount(root, close) })
 */
export function modal({ title, body, wide = false, actions = [{ label: 'Close', cls: 'btn' }], onMount }) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>${title}</h3><button class="btn ghost icon" data-x aria-label="Close">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>
    ${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="${a.cls || 'btn'}" data-i="${i}">${a.label}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-x]').onclick = close;
  back.querySelectorAll('.modal-f button').forEach((b) => {
    b.onclick = async () => {
      const a = actions[+b.dataset.i];
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const r = await a.onClick(close, back);
        if (r !== false) close();
      } catch (e) { toastErr(e); }
      finally { b.disabled = false; }
    };
  });
  root.appendChild(back);
  onMount?.(back, close);
  const first = back.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return close;
}

export function confirmBox(title, text, { danger = false, okLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal({
      title,
      body: `<p style="margin:0">${text}</p>`,
      actions: [
        { label: 'Cancel', cls: 'btn', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, cls: danger ? 'btn danger' : 'btn primary', onClick: () => { done = true; resolve(true); } },
      ],
    });
    // resolve false if dismissed
    const obs = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector('.modal-back')) && !done) { done = true; resolve(false); obs.disconnect(); }
    });
    obs.observe(document.getElementById('modal-root'), { childList: true });
    void close;
  });
}

/** Read a form's named inputs into an object */
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  });
  return out;
}

/** Image file -> resized data URL (keeps transparency as PNG) */
export function imageToDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function emptyState(title, text, ico = 'football', extra = '') {
  return `<div class="empty">${icon(ico, 'ico em-ico')}<h3>${title}</h3><p>${text}</p>${extra}</div>`;
}

/** Group an array by key fn */
export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** Compute the "current" week for a season: first week with an unfinished game, else last week. */
export function currentWeek(season) {
  if (store.settings.currentWeek && String(season) === String(store.settings.currentSeason)) {
    if (store.games.some((g) => String(g.season) === String(season) && String(g.week) === String(store.settings.currentWeek))) return String(store.settings.currentWeek);
  }
  const games = store.games.filter((g) => String(g.season) === String(season));
  const weeks = [...new Set(games.map((g) => String(g.week)))].sort(weekSort);
  for (const w of weeks) if (games.some((g) => String(g.week) === w && g.status === 'scheduled')) return w;
  return weeks[weeks.length - 1] || null;
}

export function gameLabel(g) {
  const h = teamById(g.homeId), a = teamById(g.awayId);
  return `${a?.name || 'TBD'} ${g.neutral ? 'vs' : '@'} ${h?.name || 'TBD'}`;
}
