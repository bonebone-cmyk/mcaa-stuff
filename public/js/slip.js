// Bet slip: selections, odds buttons, placing bets.
import { store, emit, esc, coins, fmtOdds, fmtLine, icon, coinSvg, post, toast, toastErr, confetti, teamById, playerById, gameById, loadMyBets, statLabel, api } from './core.js';
import { payoutFor, AWARD_BY_KEY, fmtOdds as fo } from './shared.js';

const saveSlip = () => localStorage.setItem('mcaa_slip', JSON.stringify(store.slip));
let slipTab = 'slip';
let placing = false;

export function selKey(s) {
  if (s.market === 'exact') return `exact:${s.gameId}`;
  return `${s.market}:${s.propId || s.awardId || s.specialId || s.gameId}:${s.pick}`;
}

/** Look up the live odds/line for a selection from the store. */
export function liveFor(s) {
  if (s.market === 'special') {
    const sp = store.specials.find((x) => x.id === s.specialId);
    if (!sp || sp.status !== 'open' || sp.locked) return null;
    const o = sp.options.find((x) => x.id === s.pick);
    return o ? { odds: o.odds, line: null } : null;
  }
  if (s.market === 'award') {
    const a = store.awards.find((x) => x.id === s.awardId);
    if (!a || a.status !== 'open' || a.locked) return null;
    const e = a.entries.find((x) => x.playerId === s.pick);
    return e ? { odds: e.odds, line: null } : null;
  }
  if (s.market === 'prop') {
    const pr = store.props.find((x) => x.id === s.propId);
    if (!pr || pr.status !== 'open' || pr.result != null || pr.locked) return null;
    const g = gameById(pr.gameId);
    if (!g || g.locked || g.status !== 'scheduled') return null;
    return { odds: s.pick === 'over' ? pr.over : pr.under, line: pr.line };
  }
  const g = gameById(s.gameId);
  if (!g || g.locked || g.status !== 'scheduled') return null;
  const L = g.lines || {};
  switch (s.market) {
    case 'ml': return L.ml && L.ml[s.pick] != null ? { odds: L.ml[s.pick], line: null } : null;
    case 'spread': return L.spread ? { odds: s.pick === 'home' ? L.spread.homeOdds : L.spread.awayOdds, line: s.pick === 'home' ? L.spread.home : -L.spread.home } : null;
    case 'total': case 'homeTotal': case 'awayTotal': return L[s.market] ? { odds: L[s.market][s.pick], line: L[s.market].line } : null;
    case 'exact': return L.exact ? { odds: L.exact.odds, line: null } : null;
  }
  return null;
}

/** Human description for a selection */
export function describe(s) {
  const g = s.gameId ? gameById(s.gameId) : null;
  const home = g ? teamById(g.homeId) : null, away = g ? teamById(g.awayId) : null;
  const side = s.pick === 'home' ? home?.name : away?.name;
  const ou = s.pick === 'over' ? 'Over' : 'Under';
  const ctx = g ? `${away?.abbr || away?.name || '?'} @ ${home?.abbr || home?.name || '?'}` : '';
  switch (s.market) {
    case 'ml': return { pick: side, mk: 'Moneyline', ctx };
    case 'spread': return { pick: `${side} ${fmtLine(s.line)}`, mk: 'Point Spread', ctx };
    case 'total': return { pick: `${ou} ${s.line}`, mk: 'Total Points', ctx };
    case 'homeTotal': return { pick: `${home?.name} ${ou} ${s.line}`, mk: 'Team Total Points', ctx };
    case 'awayTotal': return { pick: `${away?.name} ${ou} ${s.line}`, mk: 'Team Total Points', ctx };
    case 'exact': return { pick: `${away?.abbr || away?.name} ${s.exact?.away ?? '?'} – ${home?.abbr || home?.name} ${s.exact?.home ?? '?'}`, mk: 'Exact Score', ctx };
    case 'prop': {
      const pr = store.props.find((x) => x.id === s.propId);
      if (!pr) return { pick: 'Prop', mk: '', ctx: '' };
      const pg = gameById(pr.gameId);
      const pctx = pg ? `${teamById(pg.awayId)?.abbr || ''} @ ${teamById(pg.homeId)?.abbr || ''}` : '';
      if (pr.kind === 'player') return { pick: `${playerById(pr.playerId)?.name || 'Player'} ${ou} ${s.line}`, mk: statLabel(pr.stat), ctx: pctx };
      return { pick: `${ou} ${s.line}`, mk: pr.label, ctx: pctx };
    }
    case 'special': {
      const sp = store.specials.find((x) => x.id === s.specialId);
      const o = sp?.options.find((x) => x.id === s.pick);
      return { pick: o?.label || 'Pick', mk: sp?.question || 'Special', ctx: sp?.category || 'League special' };
    }
    case 'award': {
      const a = store.awards.find((x) => x.id === s.awardId);
      return { pick: playerById(s.pick)?.name || 'Player', mk: `${AWARD_BY_KEY[a?.key]?.name || 'Award'} winner`, ctx: a ? `${a.season} season` : '' };
    }
  }
  return { pick: s.market, mk: '', ctx: '' };
}

export function isSelected(key) { return store.slip.some((s) => s.key === key); }

export function toggleSel(sel) {
  const key = selKey(sel);
  const i = store.slip.findIndex((s) => s.key === key);
  if (i >= 0 && sel.market !== 'exact') store.slip.splice(i, 1);
  else {
    if (i >= 0) store.slip.splice(i, 1);
    const last = store.slip[store.slip.length - 1];
    store.slip.push({ ...sel, key, stake: sel.stake || last?.stake || '' });
    if (window.innerWidth <= 1024) document.querySelector('.slip-col')?.classList.add('open');
  }
  slipTab = 'slip';
  saveSlip();
  syncSelections();
  renderSlip();
}

/** Odds button HTML. sel = {market, gameId?, propId?, awardId?, pick} ; opts = {line, odds, label, wide, locked} */
export function oddsBtn(sel, { line = null, odds = null, label = '', wide = false, locked = false, showLine = true } = {}) {
  if (odds == null) return `<button class="ob na ${wide ? 'wide' : ''}" disabled>${wide && label ? `<span class="lbl">${esc(label)}</span>` : ''}<span class="od">—</span></button>`;
  const full = { ...sel, line, odds };
  const key = selKey(full);
  const on = isSelected(key);
  const lineHtml = showLine && line != null ? `<span class="ln">${sel.market === 'spread' ? fmtLine(line) : (sel.pick === 'over' ? 'O ' : sel.pick === 'under' ? 'U ' : '') + line}</span>` : '';
  if (locked) return `<button class="ob ${wide ? 'wide' : ''}" disabled title="Betting locked">${wide && label ? `<span class="lbl">${esc(label)}</span>` : lineHtml}${icon('lock', 'lock-ico')}</button>`;
  return `<button class="ob ${on ? 'sel' : ''} ${wide ? 'wide' : ''} ${!lineHtml && !wide ? 'only-odds' : ''}" data-key="${esc(key)}" data-sel="${esc(JSON.stringify(full))}">
    ${wide && label ? `<span class="lbl">${esc(label)}</span>` : lineHtml}<span class="od">${fmtOdds(odds)}</span></button>`;
}

export function syncSelections(root = document) {
  root.querySelectorAll('.ob[data-key]').forEach((b) => b.classList.toggle('sel', isSelected(b.dataset.key)));
}

// global delegated click for odds buttons
document.addEventListener('click', (e) => {
  const b = e.target.closest('.ob[data-sel]');
  if (!b || b.disabled) return;
  try { toggleSel(JSON.parse(b.dataset.sel)); } catch {}
});

/* ---------------------------------------------------------------- Slip rendering */
function validateSlip() {
  // refresh odds from the store; drop unavailable selections
  let changed = false;
  for (const s of store.slip) {
    const live = liveFor(s);
    s.unavailable = !live;
    if (live && (live.odds !== s.odds || (live.line ?? null) !== (s.line ?? null))) {
      s.changed = true; s.odds = live.odds; s.line = live.line; changed = true;
    }
  }
  if (changed) saveSlip();
}

export function renderSlip() {
  const el = document.getElementById('slip');
  if (!el) return;
  validateSlip();
  const n = store.slip.length;
  document.querySelectorAll('[data-slip-count]').forEach((x) => { x.textContent = n; x.classList.toggle('hide', !n); });
  const total = store.slip.reduce((t, s) => t + (Number(s.stake) || 0), 0);
  const win = store.slip.reduce((t, s) => t + (s.unavailable ? 0 : payoutFor(Number(s.stake) || 0, s.odds)), 0);

  el.innerHTML = `
    <div class="slip">
      <div class="slip-head">
        <h3>${icon('ticket')} Bet Slip <span class="slip-count ${n ? '' : 'hide'}">${n}</span></h3>
        <div class="row gap-sm">
          ${n ? `<button class="btn ghost sm" data-clear>Clear</button>` : ''}
          <button class="btn ghost icon slip-close" data-close-slip aria-label="Close slip">${icon('x')}</button>
        </div>
      </div>
      <div class="slip-tabs"><button class="${slipTab === 'slip' ? 'on' : ''}" data-tab="slip">Slip</button><button class="${slipTab === 'open' ? 'on' : ''}" data-tab="open">Open Bets</button></div>
      <div class="slip-body">${slipTab === 'slip' ? slipBody() : '<div class="skeleton" style="height:60px"></div>'}</div>
      ${slipTab === 'slip' && n ? `<div class="slip-foot">
        <div class="slip-sum"><span>Total stake</span><b>${coinSvg('coin sm')} <span data-total>${coins(total)}</span></b></div>
        <div class="slip-sum"><span>Potential payout</span><b class="green" data-win>${coins(win)}</b></div>
        <div class="slip-sum"><span>Your balance</span><b>${coins(store.user?.balance)}</b></div>
        <button class="btn primary lg block mt" data-place ${placing ? 'disabled' : ''}>${placing ? 'Placing…' : `Place ${n > 1 ? n + ' bets' : 'bet'}`}</button>
        <div class="tiny dim center mt">For fun only — coins have no real-world value.</div>
      </div>` : ''}
    </div>`;

  if (slipTab === 'open') renderOpenBets(el.querySelector('.slip-body'));

  el.querySelector('[data-clear]')?.addEventListener('click', () => { store.slip = []; saveSlip(); syncSelections(); renderSlip(); });
  el.querySelector('[data-close-slip]')?.addEventListener('click', () => document.querySelector('.slip-col')?.classList.remove('open'));
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { slipTab = b.dataset.tab; renderSlip(); }));
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    store.slip = store.slip.filter((s) => s.key !== b.dataset.rm); saveSlip(); syncSelections(); renderSlip();
  }));
  el.querySelectorAll('input[data-stake]').forEach((inp) => inp.addEventListener('input', () => {
    const s = store.slip.find((x) => x.key === inp.dataset.stake);
    s.stake = inp.value.replace(/[^\d]/g, '');
    if (inp.value !== s.stake) inp.value = s.stake;
    saveSlip();
    updateTotals(el);
  }));
  el.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const s = store.slip.find((x) => x.key === b.dataset.key);
    const q = b.dataset.quick;
    s.stake = String(q === 'max' ? Math.max(0, Math.floor(store.user.balance)) : (Number(s.stake) || 0) + Number(q));
    saveSlip();
    el.querySelector(`input[data-stake="${CSS.escape(s.key)}"]`).value = s.stake;
    updateTotals(el);
  }));
  el.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', () => {
    const s = store.slip.find((x) => x.key === b.dataset.accept); s.changed = false; saveSlip(); renderSlip();
  }));
  el.querySelectorAll('input[data-exact]').forEach((inp) => inp.addEventListener('input', () => {
    const s = store.slip.find((x) => x.key === inp.dataset.exact);
    s.exact = s.exact || {};
    s.exact[inp.dataset.side] = inp.value === '' ? null : Number(inp.value);
    saveSlip();
  }));
  el.querySelector('[data-place]')?.addEventListener('click', placeBets);
}

function updateTotals(el) {
  let total = 0, win = 0;
  for (const s of store.slip) {
    const st = Number(s.stake) || 0;
    total += st;
    if (!s.unavailable) win += payoutFor(st, s.odds);
    const w = el.querySelector(`[data-towin="${CSS.escape(s.key)}"]`);
    if (w) w.textContent = coins(s.unavailable ? 0 : payoutFor(st, s.odds));
  }
  const t = el.querySelector('[data-total]'); if (t) t.textContent = coins(total);
  const w = el.querySelector('[data-win]'); if (w) w.textContent = coins(win);
}

function slipBody() {
  if (!store.slip.length) {
    return `<div class="slip-empty">${coinSvg('big')}<div class="bold" style="color:var(--text)">Your slip is empty</div><div class="small mt">Tap any odds to add a bet. Every wager uses fake coins.</div></div>`;
  }
  return store.slip.map((s) => {
    const d = describe(s);
    const exactInputs = s.market === 'exact' ? (() => {
      const g = gameById(s.gameId);
      const h = teamById(g?.homeId), a = teamById(g?.awayId);
      return `<div class="grid grid-2 mt" style="gap:8px">
        <label class="f"><span class="lbl">${esc(a?.abbr || a?.name || 'Away')}</span><input type="number" min="0" class="sm" data-exact="${esc(s.key)}" data-side="away" value="${s.exact?.away ?? ''}"></label>
        <label class="f"><span class="lbl">${esc(h?.abbr || h?.name || 'Home')}</span><input type="number" min="0" class="sm" data-exact="${esc(s.key)}" data-side="home" value="${s.exact?.home ?? ''}"></label></div>`;
    })() : '';
    return `<div class="sel-card ${s.changed ? 'changed' : ''}">
      <button class="btn ghost icon x" data-rm="${esc(s.key)}" aria-label="Remove">${icon('x')}</button>
      <div class="row between top"><div class="grow"><div class="pick">${esc(d.pick)}</div><div class="mk">${esc(d.mk)}</div><div class="gm">${esc(d.ctx)}</div></div>
      <div class="odds">${s.unavailable ? '<span class="badge red">Closed</span>' : fmtOdds(s.odds)}</div></div>
      ${s.changed ? `<div class="callout warn mt small">${icon('warn')}<div class="grow">Odds/line changed. <button class="btn xs gold" data-accept="${esc(s.key)}">Accept</button></div></div>` : ''}
      ${exactInputs}
      <div class="stake-row">
        <div class="stake-in">${coinSvg('coin')}<input type="text" inputmode="numeric" placeholder="Stake" data-stake="${esc(s.key)}" value="${esc(s.stake)}"></div>
        <div class="towin">To return<b data-towin="${esc(s.key)}">${coins(s.unavailable ? 0 : payoutFor(Number(s.stake) || 0, s.odds))}</b></div>
      </div>
      <div class="quick-stakes"><button data-key="${esc(s.key)}" data-quick="10">+10</button><button data-key="${esc(s.key)}" data-quick="50">+50</button><button data-key="${esc(s.key)}" data-quick="100">+100</button><button data-key="${esc(s.key)}" data-quick="max">MAX</button></div>
    </div>`;
  }).join('');
}

async function renderOpenBets(body) {
  try {
    const bets = (await loadMyBets(true)).filter((b) => b.status === 'open');
    if (slipTab !== 'open') return;
    body.innerHTML = bets.length ? bets.map((b) => `<div class="mybet-mini"><div class="bold">${esc(b.desc)}</div>
      <div class="row between mt" style="margin-top:6px"><span class="muted num">${coins(b.stake)} @ ${fo(b.odds)}</span><span class="green num bold">→ ${coins(b.payout)}</span></div></div>`).join('')
      + `<a class="btn sm block" href="#/bets">View all my bets</a>`
      : `<div class="slip-empty"><div class="bold" style="color:var(--text)">No open bets</div><div class="small mt">Bets you place show up here until they settle.</div></div>`;
  } catch (e) { body.innerHTML = `<div class="callout err">${esc(e.message)}</div>`; }
}

async function placeBets() {
  if (placing) return;
  const live = store.slip.filter((s) => !s.unavailable);
  if (live.length !== store.slip.length) return toast('Remove closed selections first', 'err');
  if (store.slip.some((s) => s.changed)) return toast('Accept the odds changes first', 'err');
  for (const s of store.slip) {
    if (!(Number(s.stake) > 0)) return toast('Enter a stake for every bet', 'err');
    if (s.market === 'exact' && (s.exact?.home == null || s.exact?.away == null)) return toast('Enter both scores for your exact score bet', 'err');
  }
  placing = true;
  renderSlip();
  try {
    const r = await post('/api/bets', { bets: store.slip.map((s) => ({ key: s.key, market: s.market, gameId: s.gameId, propId: s.propId, awardId: s.awardId, specialId: s.specialId, pick: s.pick, line: s.line, odds: s.odds, stake: Number(s.stake), exact: s.exact })) });
    store.user = r.user;
    store.slip = [];
    store.myBets = null;
    saveSlip();
    confetti();
    toast(`${r.bets.length} bet${r.bets.length > 1 ? 's' : ''} placed. Good luck!`);
    emit();
  } catch (e) {
    if (e.status === 409 && e.data?.changed) {
      // refresh data so new odds show
      const d = await api('/api/bootstrap');
      Object.assign(store, { games: d.games, props: d.props, awards: d.awards, specials: d.specials || [] });
      emit();
    }
    toastErr(e);
  } finally {
    placing = false;
    syncSelections();
    renderSlip();
  }
}
