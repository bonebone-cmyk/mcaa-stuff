// MCAA Sports — app shell, auth screen and router.
import { store, api, post, setToken, getToken, loadAll, onChange, esc, coins, icon, coinSvg, toast, toastErr, modal, formData, refreshUser } from './core.js';
import { renderSlip, syncSelections } from './slip.js';
import { viewBook } from './views/book.js';
import { viewGame } from './views/game.js';
import { viewFutures } from './views/futures.js';
import { viewBets } from './views/bets.js';
import { viewLeaderboard } from './views/leaderboard.js';
import { viewTeams, viewTeam } from './views/teams.js';
import { viewPlayers, viewPlayer } from './views/players.js';
import { viewAdmin } from './admin/admin.js';
import { viewSpecials } from './views/specials.js';

const app = document.getElementById('app');

/* ---------------------------------------------------------------- Auth screen */
function renderAuth(mode = 'login') {
  const blocks = Array.from({ length: 9 }, (_, i) => {
    const colors = ['#3ee08f', '#8b5a2b', '#3ad7f0', '#fbbf24', '#6b7280', '#22c55e', '#a78bfa', '#ef4444', '#64748b'];
    const pos = [[78, 10], [62, 22], [88, 30], [8, 84], [58, 86], [36, 10], [90, 70], [80, 54], [30, 90]][i];
    return `<span style="left:${pos[0]}%;top:${pos[1]}%;background:${colors[i]};animation-delay:${i * 0.6}s;transform:scale(${0.5 + (i % 3) * 0.25})"></span>`;
  }).join('');
  app.innerHTML = `
  <div class="auth-wrap">
    <section class="auth-hero">
      <div class="blocks">${blocks}</div>
      <div class="auth-brand"><img src="/img/logo.svg" alt=""><div><div class="t1">MCAA <span class="green">SPORTS</span></div><div class="t2">Minecraft College Athletics Association</div></div></div>
      <div class="auth-pitch">
        <div class="eyebrow">The official MCAA sportsbook</div>
        <h1>Call your shot. <span class="hl">Stack your coins.</span></h1>
        <p>Bet moneylines, spreads, totals, exact scores, player props and award futures on every MCAA game — all with fake coins, all for bragging rights.</p>
        <div class="auth-chips">
          <span class="chip">${icon('scale')} Spreads</span><span class="chip">${icon('chart')} Over/Unders</span>
          <span class="chip">${icon('user')} Player Props</span><span class="chip">${icon('trophy')} Award Odds</span>
        </div>
      </div>
      <div class="auth-foot">Coins are play money with no cash value. No real-money gambling here.</div>
    </section>
    <section class="auth-panel">
      <form class="auth-card" autocomplete="on">
        <h2>${mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <div class="muted">${mode === 'login' ? 'Log in to place your bets.' : 'Pick a username and password to get your starting coins.'}</div>
        <div class="tabs-seg"><button type="button" class="${mode === 'login' ? 'on' : ''}" data-mode="login">Log in</button><button type="button" class="${mode === 'signup' ? 'on' : ''}" data-mode="signup">Sign up</button></div>
        <div class="col" style="gap:14px">
          <label class="f"><span class="lbl">Username</span><input type="text" name="username" autocomplete="username" required maxlength="20" placeholder="e.g. Steve_23"></label>
          <label class="f"><span class="lbl">Password</span>
            <div class="pw-wrap"><input type="password" name="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="${mode === 'login' ? 1 : 6}" placeholder="${mode === 'login' ? 'Your password' : 'At least 6 characters'}"><button type="button" class="btn ghost xs" data-peek>Show</button></div></label>
          ${mode === 'signup' ? `<label class="f"><span class="lbl">Confirm password</span><input type="password" name="confirm" autocomplete="new-password" required placeholder="Type it again"></label>` : ''}
          <div class="form-err" data-err></div>
          <button class="btn primary lg block" type="submit">${mode === 'login' ? 'Log in' : 'Create account'}</button>
        </div>
      </form>
    </section>
  </div>`;
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => renderAuth(b.dataset.mode)));
  app.querySelector('[data-peek]').addEventListener('click', (e) => {
    const inp = app.querySelector('input[name=password]');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    e.target.textContent = inp.type === 'password' ? 'Show' : 'Hide';
  });
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const err = form.querySelector('[data-err]');
    err.textContent = '';
    if (mode === 'signup' && d.password !== d.confirm) { err.textContent = 'Passwords do not match'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await post(mode === 'login' ? '/api/login' : '/api/register', { username: d.username, password: d.password });
      setToken(r.token);
      if (mode === 'signup' && r.user.isOwner) toast('You are the league owner — admin tools unlocked!');
      else toast(mode === 'login' ? `Welcome back, ${r.user.username}!` : `Welcome to MCAA Sports, ${r.user.username}!`);
      await start();
    } catch (ex) {
      err.textContent = ex.message;
    } finally { btn.disabled = false; }
  });
}

/* ---------------------------------------------------------------- Shell */
const NAV = [
  { href: '#/', key: 'book', label: 'Sportsbook', ico: 'football' },
  { href: '#/specials', key: 'specials', label: 'Specials', ico: 'star' },
  { href: '#/futures', key: 'futures', label: 'Awards', ico: 'trophy' },
  { href: '#/bets', key: 'bets', label: 'My Bets', ico: 'ticket' },
  { href: '#/leaderboard', key: 'leaderboard', label: 'Leaders', ico: 'chart' },
  { href: '#/teams', key: 'teams', label: 'Teams', ico: 'shield' },
  { href: '#/players', key: 'players', label: 'Players', ico: 'users' },
];

function renderShell() {
  const u = store.user;
  app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#/"><img src="/img/logo.svg" alt=""><div><div class="bt">MCAA <b>SPORTS</b></div><div class="bs">Minecraft College Athletics</div></div></a>
      <nav class="nav">${NAV.map((n) => `<a href="${n.href}" data-nav="${n.key}">${icon(n.ico)}<span class="lbl">${n.label}</span></a>`).join('')}
        ${u.isAdmin ? `<a href="#/admin" data-nav="admin" class="admin-link">${icon('gear')}<span class="lbl">Admin</span></a>` : ''}</nav>
      <div class="top-right">
        <a class="coin-pill" href="#/bets" title="Your coins" style="text-decoration:none">${coinSvg()}<span data-balance>${coins(u.balance)}</span></a>
        <button class="user-btn" data-user-menu><span class="avatar">${esc(u.username[0].toUpperCase())}</span><span class="un">${esc(u.username)}</span></button>
      </div>
    </header>
    ${store.settings.announcement ? `<div class="announce">${icon('flag')} ${esc(store.settings.announcement)}</div>` : ''}
    <div class="layout">
      <main class="main" id="view"></main>
      <aside class="slip-col" id="slip"></aside>
    </div>
    <button class="btn primary lg slip-fab" data-open-slip>${icon('ticket')} Slip <span class="slip-count hide" data-slip-count>0</span></button>
    <nav class="mobile-nav">${NAV.slice(0, 4).map((n) => `<a href="${n.href}" data-nav="${n.key}">${icon(n.ico)}${n.label}</a>`).join('')}
      ${u.isAdmin ? `<a href="#/admin" data-nav="admin">${icon('gear')}Admin</a>` : `<a href="#/teams" data-nav="teams">${icon('shield')}Teams</a>`}</nav>
  </div>`;
  app.querySelector('[data-open-slip]').addEventListener('click', () => app.querySelector('.slip-col').classList.add('open'));
  app.querySelector('[data-user-menu]').addEventListener('click', openUserMenu);
  renderSlip();
}

function openUserMenu(e) {
  e.stopPropagation();
  document.querySelector('.menu')?.remove();
  const u = store.user;
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = `<div style="padding:8px 10px"><div class="bold">${esc(u.username)}</div><div class="small muted">${u.isOwner ? 'League owner · Admin' : u.isAdmin ? 'Admin' : 'Member'}</div></div><hr>
    <a href="#/bets">${icon('ticket')} My bets</a>
    <a href="#/leaderboard">${icon('chart')} Leaderboard</a>
    <a href="#/players">${icon('users')} Players</a>
    <a href="#/teams">${icon('shield')} Teams</a>
    <button data-pw>${icon('key')} Change password</button><hr>
    <button data-logout>${icon('logout')} Log out</button>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
  m.querySelector('[data-logout]').onclick = async () => { try { await post('/api/logout'); } catch {} setToken(null); location.hash = '#/'; renderAuth('login'); };
  m.querySelector('[data-pw]').onclick = () => modal({
    title: 'Change password',
    body: `<div class="col"><label class="f"><span class="lbl">Current password</span><input type="password" name="current"></label>
      <label class="f"><span class="lbl">New password</span><input type="password" name="password" placeholder="At least 6 characters"></label></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn primary', onClick: async (close, root) => { await post('/api/me/password', formData(root)); toast('Password updated'); } }],
  });
}

function updateChrome() {
  const b = document.querySelector('[data-balance]');
  if (b) b.textContent = coins(store.user.balance);
  renderSlip();
  syncSelections();
}

/* ---------------------------------------------------------------- Router */
let currentRoute = '';
async function route() {
  const view = document.getElementById('view');
  if (!view) return;
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('?')[0].split('/').filter(Boolean);
  const key = parts[0] || 'book';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
  document.querySelector('.slip-col')?.classList.remove('open');
  document.querySelector('.layout')?.classList.toggle('no-slip', key === 'admin');
  if (currentRoute !== hash) window.scrollTo(0, 0);
  currentRoute = hash;
  if (key !== 'bets') refreshUser().catch(() => {}); // keep the coin balance current (bets settle while you browse)
  try {
    switch (key) {
      case 'book': return await viewBook(view);
      case 'game': return await viewGame(view, parts[1]);
      case 'futures': return await viewFutures(view);
      case 'specials': return await viewSpecials(view);
      case 'bets': return await viewBets(view);
      case 'leaderboard': return await viewLeaderboard(view);
      case 'teams': return await viewTeams(view);
      case 'team': return await viewTeam(view, parts[1]);
      case 'players': return await viewPlayers(view);
      case 'player': return await viewPlayer(view, parts[1]);
      case 'admin':
        if (!store.user.isAdmin) { location.hash = '#/'; return; }
        return await viewAdmin(view, parts[1] || 'overview', parts.slice(2));
      default: location.hash = '#/';
    }
  } catch (e) {
    view.innerHTML = `<div class="callout err">${icon('warn')} ${esc(e.message)}</div>`;
  }
}
export const rerender = () => route();

window.addEventListener('hashchange', route);
window.addEventListener('mcaa:logout', () => renderAuth('login'));
onChange(updateChrome);

async function start() {
  if (!getToken()) return renderAuth('login');
  try {
    await loadAll();
  } catch (e) {
    if (e.status === 401) return renderAuth('login');
    app.innerHTML = `<div class="boot"><img src="/img/logo.svg" alt=""><span>${esc(e.message)}</span><button class="btn" onclick="location.reload()">Retry</button></div>`;
    return;
  }
  renderShell();
  route();
}

// refresh balances/odds when returning to the tab
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !store.user) return;
  try {
    const d = await api('/api/bootstrap');
    Object.assign(store, { user: d.user, games: d.games, props: d.props, awards: d.awards, specials: d.specials || [], teams: d.teams, players: d.players, settings: d.settings, seasons: d.seasons });
    updateChrome();
  } catch {}
});

start().catch(toastErr);
