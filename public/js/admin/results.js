import { store, post, esc, icon, teamById, teamLogo, toast, toastErr, confirmBox, loadAll, emptyState, weekLabel, weekSort, currentWeek } from '../core.js';
import { adminHead } from './admin.js';

let wkSel = null;

export async function renderResults(el) {
  const season = store.settings.currentSeason;
  const games = store.games.filter((g) => String(g.season) === String(season));
  const weeks = [...new Set(games.map((g) => String(g.week)))].sort(weekSort);
  if (!wkSel || !weeks.includes(wkSel)) wkSel = currentWeek(season);
  const list = games.filter((g) => String(g.week) === String(wkSel));
  const openCount = list.filter((g) => g.status === 'scheduled' && !g.locked).length;
  const pending = list.filter((g) => g.status === 'scheduled');

  el.innerHTML = `
    ${adminHead('Lock Betting & Final Scores', 'Lock the week before you sim, then type in the final scores. Bets settle the moment you save.')}
    ${!games.length ? emptyState('No games yet', 'Import or add games first.', 'calendar') : `
    <div class="row wrap mb">
      <select id="wk" style="width:auto">${weeks.map((w) => `<option value="${esc(w)}" ${w === wkSel ? 'selected' : ''}>${esc(weekLabel(w))}</option>`).join('')}</select>
      <span class="grow"></span>
      ${openCount ? `<button class="btn gold" data-lockall>${icon('lock')} Lock all ${openCount} open games</button>` : pending.length ? '<span class="badge gold">All games locked ✓</span>' : ''}
    </div>
    ${openCount ? `<div class="callout warn mb">${icon('warn')}<div>${openCount} game${openCount === 1 ? ' is' : 's are'} still open for betting. Lock them before you sim so nobody bets after results are known.</div></div>` : ''}
    <div class="table-wrap"><table class="t"><thead><tr><th>Matchup</th><th class="center">Away</th><th class="center">Home</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((g) => {
        const a = teamById(g.awayId), h = teamById(g.homeId);
        const openProps = store.props.filter((p) => p.gameId === g.id && p.status === 'open').length;
        return `<tr>
          <td><div class="row">${teamLogo(a, 'sm')}<b>${esc(a?.name)}</b><span class="muted">@</span>${teamLogo(h, 'sm')}<b>${esc(h?.name)}</b>${g.gotw ? '<span class="badge gold">★</span>' : ''}</div></td>
          <td class="center"><input class="xs" type="number" min="0" data-a="${g.id}" value="${g.awayScore ?? ''}" ${g.status === 'cancelled' ? 'disabled' : ''}></td>
          <td class="center"><input class="xs" type="number" min="0" data-h="${g.id}" value="${g.homeScore ?? ''}" ${g.status === 'cancelled' ? 'disabled' : ''}></td>
          <td>${g.status === 'final' ? '<span class="badge blue">Final · settled</span>' : g.status === 'cancelled' ? '<span class="badge red">Cancelled</span>' : g.locked ? '<span class="badge gold">Locked</span>' : '<span class="badge green">Open</span>'}
            ${openProps ? `<a class="badge purple" href="#/admin/stats/${g.id}" title="Import box score to grade">${openProps} props to grade</a>` : ''}</td>
          <td class="right nowrap">
            ${g.status === 'scheduled' ? `<button class="btn xs" data-lock="${g.id}" data-v="${g.locked ? 0 : 1}">${icon(g.locked ? 'unlock' : 'lock', 'ico i-sm')} ${g.locked ? 'Unlock' : 'Lock'}</button>` : ''}
            ${g.status !== 'cancelled' ? `<button class="btn xs primary" data-final="${g.id}">${g.status === 'final' ? 'Update' : 'Final'}</button>` : ''}
            ${g.status === 'final' ? `<button class="btn xs" data-reopen="${g.id}" title="Undo final & unsettle bets">Undo</button>` : ''}
            <a class="btn xs" href="#/admin/stats/${g.id}">${icon('list', 'ico i-sm')} Box score</a>
            ${g.status === 'scheduled' ? `<button class="btn xs danger" data-cancel="${g.id}" title="Cancel game & refund all bets">Cancel</button>` : ''}</td></tr>`;
      }).join('')}
    </tbody></table></div>
    <div class="row mt"><button class="btn primary" data-saveall>${icon('check')} Save all entered scores as final</button><span class="small muted">Only rows with both scores filled are saved.</span></div>`}`;

  const refresh = async () => { await loadAll(); renderResults(el); };
  el.querySelector('#wk')?.addEventListener('change', (e) => { wkSel = e.target.value; renderResults(el); });
  el.querySelector('[data-lockall]')?.addEventListener('click', async () => {
    try { const r = await post('/api/admin/games/lock-week', { season, week: wkSel, locked: true }); toast(`${r.updated} games locked`); refresh(); } catch (e) { toastErr(e); }
  });
  el.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = async () => { await post(`/api/admin/games/${b.dataset.lock}/lock`, { locked: b.dataset.v === '1' }); refresh(); }));
  const scores = (id) => ({ a: el.querySelector(`[data-a="${id}"]`).value, h: el.querySelector(`[data-h="${id}"]`).value });
  el.querySelectorAll('[data-final]').forEach((b) => (b.onclick = async () => {
    const s = scores(b.dataset.final);
    if (s.a === '' || s.h === '') return toast('Enter both scores', 'err');
    try { await post(`/api/admin/games/${b.dataset.final}/final`, { awayScore: Number(s.a), homeScore: Number(s.h) }); toast('Final saved — bets settled'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Undo final?', 'This un-settles every game-line bet on this game (payouts are taken back) and puts it back to locked.', { okLabel: 'Undo final' }))) return;
    await post(`/api/admin/games/${b.dataset.reopen}/reopen`); toast('Final removed'); refresh();
  }));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Cancel game?', 'All bets on this game (including props) will be voided and refunded.', { danger: true, okLabel: 'Cancel game' }))) return;
    await post(`/api/admin/games/${b.dataset.cancel}/cancel`); toast('Game cancelled, bets refunded'); refresh();
  }));
  el.querySelector('[data-saveall]')?.addEventListener('click', async () => {
    const items = list.filter((g) => g.status !== 'cancelled').map((g) => ({ g, ...scores(g.id) }))
      .filter((x) => x.a !== '' && x.h !== '' && (x.g.status !== 'final' || Number(x.a) !== x.g.awayScore || Number(x.h) !== x.g.homeScore))
      .map((x) => ({ gameId: x.g.id, awayScore: Number(x.a), homeScore: Number(x.h) }));
    if (!items.length) return toast('No new scores to save', 'err');
    const unlocked = items.filter((i) => { const g = store.games.find((x) => x.id === i.gameId); return g.status === 'scheduled' && !g.locked; });
    if (unlocked.length && !(await confirmBox('Some games are still open', `${unlocked.length} of these games weren't locked. Saving a final locks them automatically. Continue?`, { okLabel: 'Save finals' }))) return;
    try { const r = await post('/api/admin/finals/bulk', { items }); toast(`${r.updated} finals saved — bets settled`); refresh(); } catch (e) { toastErr(e); }
  });
}
