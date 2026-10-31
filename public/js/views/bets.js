import { store, esc, icon, coins, coinSvg, fmtOdds, fmtWhen, loadMyBets, emptyState, api, refreshUser } from '../core.js';

let filter = 'open';

export function betRows(bets) {
  return bets.map((b) => {
    const lbl = { open: 'OPEN', won: 'WON', lost: 'LOST', push: 'PUSH', void: 'VOID' }[b.status];
    const result = b.status === 'open' ? `<div class="s">To return</div><div class="p green">${coins(b.payout)}</div>`
      : b.status === 'won' ? `<div class="s">Returned</div><div class="p green">+${coins(b.returned)}</div>`
      : b.status === 'lost' ? `<div class="s">Lost</div><div class="p red">-${coins(b.stake)}</div>`
      : `<div class="s">Refunded</div><div class="p muted">${coins(b.returned)}</div>`;
    const market = { ml: 'Moneyline', spread: 'Point Spread', total: 'Total Points', homeTotal: 'Team Total', awayTotal: 'Team Total', exact: 'Exact Score', prop: 'Prop', award: 'Award Future', special: 'Special' }[b.market] || b.market;
    return `<div class="bet-row">
      <div class="bet-status ${b.status}">${lbl}</div>
      <div style="min-width:0"><div class="d">${esc(b.desc)}</div>
        <div class="m">${market} · <span class="num">${fmtOdds(b.odds)}</span> · Stake <span class="num">${coins(b.stake)}</span> · ${fmtWhen(b.createdAt)}
        ${b.gameId ? ` · <a href="#/game/${b.gameId}">game</a>` : ''}</div></div>
      <div class="amt">${result}</div></div>`;
  }).join('');
}

export async function viewBets(el) {
  el.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  const [bets] = await Promise.all([loadMyBets(true), refreshUser().catch(() => {})]);
  const settled = bets.filter((b) => b.status !== 'open');
  const won = bets.filter((b) => b.status === 'won').length;
  const lost = bets.filter((b) => b.status === 'lost').length;
  const profit = settled.reduce((s, b) => s + (b.returned || 0) - b.stake, 0);
  const atRisk = bets.filter((b) => b.status === 'open').reduce((s, b) => s + b.stake, 0);
  const shown = bets.filter((b) => filter === 'all' || (filter === 'open' ? b.status === 'open' : b.status !== 'open'));

  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Your action</div><h1>My Bets</h1><div class="sub">Track open wagers and your betting history.</div></div>
      <button class="btn sm" id="ledger">${icon('coins')} Coin history</button></div>
    <div class="stat-tiles mb">
      <div class="tile"><div class="k">Balance</div><div class="v">${coinSvg()} ${coins(store.user.balance)}</div></div>
      <div class="tile"><div class="k">In play</div><div class="v">${coins(atRisk)}</div></div>
      <div class="tile"><div class="k">Record</div><div class="v">${won}-${lost}</div></div>
      <div class="tile"><div class="k">Profit</div><div class="v ${profit > 0 ? 'green' : profit < 0 ? 'red' : ''}">${profit > 0 ? '+' : ''}${coins(profit)}</div></div>
    </div>
    <div class="row between mb"><div class="seg">${['open', 'settled', 'all'].map((f) => `<button data-f="${f}" class="${filter === f ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div><span class="small muted">${shown.length} bet${shown.length === 1 ? '' : 's'}</span></div>
    ${shown.length ? `<div class="card pad0">${betRows(shown)}</div>` : emptyState(filter === 'open' ? 'No open bets' : 'Nothing here yet', 'Head to the sportsbook and tap any odds to build your slip.', 'ticket', '<div class="mt"><a class="btn primary" href="#/">Go to Sportsbook</a></div>')}`;
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; viewBets(el); }));
  el.querySelector('#ledger').addEventListener('click', async () => {
    const { modal } = await import('../core.js');
    const { ledger } = await api('/api/ledger');
    modal({ title: 'Coin history', wide: true, body: ledger.length ? `<div class="table-wrap"><table class="t compact"><thead><tr><th>When</th><th>What</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>
      ${ledger.map((l) => `<tr><td class="nowrap">${fmtWhen(l.at)}</td><td>${esc(l.reason)}</td><td class="num ${l.amount >= 0 ? 'green' : 'red'}">${l.amount >= 0 ? '+' : ''}${coins(l.amount)}</td><td class="num">${coins(l.balance)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="muted">No history yet.</div>' });
  });
}
