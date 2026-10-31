import { store, api, post, del, esc, icon, coins, coinSvg, modal, formData, toast, toastErr, confirmBox, ago, refreshUser, fmtOdds } from '../core.js';
import { adminHead } from './admin.js';
import { betRows } from '../views/bets.js';

let q = '';

export async function renderUsers(el) {
  el.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  const { users } = await api('/api/admin/users');
  const draw = () => {
    const list = users.filter((u) => !q || u.username.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.isOwner - a.isOwner || b.isAdmin - a.isAdmin || a.username.localeCompare(b.username));
    el.querySelector('#ulist').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>User</th><th>Role</th><th class="num">Balance</th><th class="num">In play</th><th class="num">Bets</th><th>Last seen</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td><div class="row"><span class="avatar">${esc(u.username[0].toUpperCase())}</span><b>${esc(u.username)}</b>${u.id === store.user.id ? '<span class="badge green">You</span>' : ''}</div></td>
        <td>${u.isOwner ? '<span class="badge gold">Owner</span>' : u.isAdmin ? '<span class="badge purple">Admin</span>' : '<span class="badge">Member</span>'}</td>
        <td class="num"><span class="row" style="justify-content:flex-end;gap:6px">${coinSvg('coin sm')}${coins(u.balance)}</span></td><td class="num">${coins(u.atRisk)}</td><td class="num">${u.bets}</td>
        <td class="small muted">${ago(u.lastSeen)}</td>
        <td class="right nowrap">
          <button class="btn xs gold" data-bal="${u.id}">${icon('coins', 'ico i-sm')} Coins</button>
          <button class="btn xs" data-bets="${u.id}">${icon('ticket', 'ico i-sm')} Bets</button>
          ${u.isOwner ? '' : `<button class="btn xs" data-admin="${u.id}" data-v="${u.isAdmin ? 0 : 1}">${u.isAdmin ? 'Remove admin' : 'Make admin'}</button>`}
          <button class="btn xs" data-pw="${u.id}" title="Reset password">${icon('key', 'ico i-sm')}</button>
          ${u.isOwner || u.id === store.user.id ? '' : `<button class="btn xs danger" data-del="${u.id}">${icon('trash', 'ico i-sm')}</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
    bind();
  };
  el.innerHTML = `
    ${adminHead('Users & Balances', `${users.length} account${users.length === 1 ? '' : 's'} · ${users.filter((u) => u.isAdmin).length} admin${users.filter((u) => u.isAdmin).length === 1 ? '' : 's'}`,
      `<button class="btn gold" data-bonus>${icon('coins')} Give everyone coins</button>`)}
    <div class="search mb">${icon('search')}<input type="search" id="uq" placeholder="Search users…" value="${esc(q)}"></div>
    <div id="ulist"></div>`;
  el.querySelector('#uq').addEventListener('input', (e) => { q = e.target.value; draw(); });
  const refresh = () => renderUsers(el);

  el.querySelector('[data-bonus]').onclick = () => modal({
    title: 'Give everyone coins',
    body: `<div class="col"><label class="f"><span class="lbl">Amount per user (negative to take away)</span><input type="number" name="amount" placeholder="500"></label>
      <label class="f"><span class="lbl">Note (shows in their coin history)</span><input name="note" placeholder="e.g. Week 5 bonus"></label></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Send coins', cls: 'btn gold', onClick: async (c, root) => { const d = formData(root); const r = await post('/api/admin/users/bulk-balance', d); toast(`${coins(d.amount)} coins sent to ${r.updated} users`); await refreshUser(); refresh(); } }],
  });

  function bind() {
    el.querySelectorAll('[data-bal]').forEach((b) => (b.onclick = () => {
      const u = users.find((x) => x.id === b.dataset.bal);
      modal({
        title: `Adjust ${esc(u.username)}'s coins`,
        body: `<div class="tile mb"><div class="k">Current balance</div><div class="v">${coinSvg()} ${coins(u.balance)}</div></div>
          <div class="col"><div class="seg" id="mode"><button type="button" class="on" data-m="add">Add / remove</button><button type="button" data-m="set">Set exact balance</button></div>
          <label class="f"><span class="lbl" id="amt-l">Amount (use a minus sign to remove)</span><input type="number" name="amount" placeholder="e.g. 250 or -100"></label>
          <label class="f"><span class="lbl">Note</span><input name="note" placeholder="Optional reason"></label></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn primary', onClick: async (c, root) => {
          const d = formData(root);
          if (d.amount === '') { toast('Enter an amount', 'err'); return false; }
          await post(`/api/admin/users/${u.id}/balance`, { ...d, mode: root.querySelector('#mode .on').dataset.m });
          toast('Balance updated'); await refreshUser(); refresh();
        } }],
        onMount(root) {
          root.querySelectorAll('[data-m]').forEach((x) => x.addEventListener('click', () => {
            root.querySelectorAll('[data-m]').forEach((y) => y.classList.toggle('on', y === x));
            root.querySelector('#amt-l').textContent = x.dataset.m === 'set' ? 'New balance' : 'Amount (use a minus sign to remove)';
          }));
        },
      });
    }));
    el.querySelectorAll('[data-admin]').forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.admin);
      const make = b.dataset.v === '1';
      if (!(await confirmBox(make ? 'Make admin?' : 'Remove admin?', make ? `<b>${esc(u.username)}</b> will be able to edit games, odds, scores and balances.` : `<b>${esc(u.username)}</b> will lose admin tools.`, { okLabel: make ? 'Make admin' : 'Remove admin', danger: !make }))) return;
      try { await post(`/api/admin/users/${u.id}/admin`, { isAdmin: make }); toast(make ? `${u.username} is now an admin` : 'Admin removed'); if (u.id === store.user.id) location.reload(); refresh(); } catch (e) { toastErr(e); }
    }));
    el.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => {
      const u = users.find((x) => x.id === b.dataset.pw);
      modal({
        title: `Reset password for ${esc(u.username)}`,
        body: `<label class="f"><span class="lbl">New password</span><input name="password" type="text" placeholder="At least 6 characters"></label><div class="small muted mt">They'll be logged out everywhere and can log in with this password.</div>`,
        actions: [{ label: 'Cancel' }, { label: 'Reset', cls: 'btn primary', onClick: async (c, root) => { await post(`/api/admin/users/${u.id}/password`, formData(root)); toast('Password reset'); } }],
      });
    }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox('Delete account?', `Delete <b>${esc(u.username)}</b> and all their bets? This can't be undone.`, { danger: true, okLabel: 'Delete' }))) return;
      try { await del('/api/admin/users/' + u.id); toast('User deleted'); refresh(); } catch (e) { toastErr(e); }
    }));
    el.querySelectorAll('[data-bets]').forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.bets);
      const { bets } = await api(`/api/admin/users/${u.id}/bets`);
      const close = modal({
        title: `${esc(u.username)}'s bets`, wide: true,
        body: bets.length ? `<div class="card pad0">${betRows(bets)}</div>
          <div class="section-title">Void a bet (refunds the stake)</div>
          <div class="col gap-sm">${bets.filter((x) => x.status !== 'void').slice(0, 50).map((x) => `<div class="row between small"><span>${esc(x.desc)} · ${coins(x.stake)} @ ${fmtOdds(x.odds)} · <b>${x.status}</b></span><button class="btn xs danger" data-void="${x.id}">Void</button></div>`).join('')}</div>`
          : '<div class="muted">No bets yet.</div>',
        actions: [{ label: 'Close' }],
        onMount(root) {
          root.querySelectorAll('[data-void]').forEach((v) => (v.onclick = async () => {
            if (!(await confirmBox('Void bet?', 'The stake is refunded (and any payout is reversed).', { okLabel: 'Void bet' }))) return;
            await post(`/api/admin/bets/${v.dataset.void}/void`); toast('Bet voided'); close(); refresh();
          }));
        },
      });
    }));
  }
  draw();
}
