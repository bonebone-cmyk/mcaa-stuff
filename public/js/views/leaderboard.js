import { store, api, esc, coins, coinSvg, emptyState } from '../core.js';

export async function viewLeaderboard(el) {
  el.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const { rows } = await api('/api/leaderboard');
  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Bragging rights</div><h1>Leaderboard</h1><div class="sub">Ranked by total coins (balance + coins in play).</div></div></div>
    ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Bettor</th><th class="num">Balance</th><th class="num">In play</th><th class="num">W-L</th><th class="num">Profit</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr ${r.username === store.user.username ? 'style="background:rgba(62,224,143,.06)"' : ''}>
        <td class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</td>
        <td><div class="row"><span class="avatar">${esc(r.username[0].toUpperCase())}</span><b>${esc(r.username)}</b>${r.username === store.user.username ? '<span class="badge green">You</span>' : ''}</div></td>
        <td class="num"><span class="row" style="justify-content:flex-end;gap:6px">${coinSvg('coin sm')} ${coins(r.balance)}</span></td>
        <td class="num">${coins(r.atRisk)}</td>
        <td class="num">${r.won}-${r.lost}</td>
        <td class="num ${r.profit > 0 ? 'green' : r.profit < 0 ? 'red' : ''}">${r.profit > 0 ? '+' : ''}${coins(r.profit)}</td></tr>`).join('')}
    </tbody></table></div>` : emptyState('No bettors yet', 'Sign-ups will appear here.', 'chart')}`;
}
