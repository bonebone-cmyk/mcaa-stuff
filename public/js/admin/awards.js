import { store, post, del, esc, icon, teamById, playerById, teamLogo, toast, toastErr, confirmBox, loadAll, loadStats, teamRecords, fmtOdds, trophySvg, modal } from '../core.js';
import { AWARDS, STATS, recommendForAward, isValidOdds } from '../shared.js';
import { adminHead } from './admin.js';

const drafts = {}; // key -> [{playerId, odds}]
const recs = {};   // key -> recommendation rows
let draftSeason = null;

export async function renderAwards(el) {
  const season = store.settings.currentSeason;
  if (draftSeason !== season) { for (const k of Object.keys(drafts)) delete drafts[k]; for (const k of Object.keys(recs)) delete recs[k]; draftSeason = season; }
  let stats = { players: {} };
  try { stats = await loadStats(season, true); } catch {}
  const statCount = Object.keys(stats.players || {}).length;
  const rec = teamRecords(season);
  const winPct = Object.fromEntries(Object.entries(rec).map(([id, r]) => [id, (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t)]));

  for (const a of AWARDS) {
    if (!drafts[a.key]) {
      const live = store.awards.find((x) => x.key === a.key && String(x.season) === String(season));
      drafts[a.key] = live ? live.entries.map((e) => ({ ...e })) : [];
    }
  }

  el.innerHTML = `
    ${adminHead('Award Odds', `Season ${esc(season)} · ${statCount ? `${statCount} players with stats` : 'no player stats yet'}`,
      `<button class="btn primary" data-recall ${statCount ? '' : 'disabled'}>${icon('wand')} Recommend candidates for every award</button>`)}
    ${statCount ? `<div class="callout info mb">${icon('info')}<div>Recommendations are ranked from imported stats (position-aware: QBOTY only looks at QBs, DLOTY/DPOY at all defenders, FOTY at freshmen, etc.) with suggested odds. Tweak anything, then <b>Post</b> each board.</div></div>`
      : `<div class="callout warn mb">${icon('warn')}<div>Import player stats first (Admin → Import Stats) to get recommended candidates. You can still build boards by hand below.</div></div>`}
    <div class="col" style="gap:14px">${AWARDS.map((a) => awardCard(a, season, stats)).join('')}</div>`;

  const refresh = async () => { await loadAll(); renderAwards(el); };
  const rerender = () => renderAwards(el);

  el.querySelector('[data-recall]')?.addEventListener('click', () => {
    let n = 0;
    for (const a of AWARDS) { recs[a.key] = recommendForAward(a.key, store.players, stats.players, winPct, 10); if (recs[a.key].length) n++; }
    toast(n ? `Recommendations ready for ${n} awards` : 'Not enough stats to recommend anyone yet', n ? 'ok' : 'err');
    rerender();
  });
  el.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => {
    recs[b.dataset.rec] = recommendForAward(b.dataset.rec, store.players, stats.players, winPct, 10);
    if (!recs[b.dataset.rec].length) toast('No eligible players with stats yet', 'err');
    rerender();
  }));
  el.querySelectorAll('[data-userec]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.userec;
    const picked = [...el.querySelectorAll(`input[data-recpick="${k}"]:checked`)].map((c) => recs[k][+c.value]);
    for (const r of picked) {
      const ex = drafts[k].find((d) => d.playerId === r.playerId);
      if (ex) ex.odds = r.odds; else drafts[k].push({ playerId: r.playerId, odds: r.odds });
    }
    delete recs[k];
    toast(`${picked.length} players added to the ${k} board — post it when ready`);
    rerender();
  }));
  el.querySelectorAll('[data-hiderec]').forEach((b) => (b.onclick = () => { delete recs[b.dataset.hiderec]; rerender(); }));
  el.querySelectorAll('input[data-odds]').forEach((inp) => inp.addEventListener('input', () => {
    const [k, i] = inp.dataset.odds.split(':');
    drafts[k][+i].odds = inp.value.trim() === '' ? null : Number(inp.value.trim().replace(/^\+/, ''));
  }));
  el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.rm.split(':'); drafts[k].splice(+i, 1); rerender(); }));
  el.querySelectorAll('select[data-addp]').forEach((s) => s.addEventListener('change', () => {
    if (!s.value) return;
    const k = s.dataset.addp;
    if (!drafts[k].some((d) => d.playerId === s.value)) drafts[k].push({ playerId: s.value, odds: 1000 });
    rerender();
  }));
  el.querySelectorAll('[data-post]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.post;
    const bad = drafts[k].find((d) => !isValidOdds(d.odds));
    if (bad) return toast(`Fix the odds for ${playerById(bad.playerId)?.name}`, 'err');
    if (!drafts[k].length) return toast('Add at least one player', 'err');
    const live = store.awards.find((x) => x.key === k && String(x.season) === String(season));
    try { await post('/api/admin/awards', { id: live?.id, key: k, season, entries: drafts[k], locked: live?.locked }); toast(`${k} odds posted`); delete drafts[k]; refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-alock]').forEach((b) => (b.onclick = async () => {
    const a = store.awards.find((x) => x.id === b.dataset.alock);
    try { await post('/api/admin/awards', { id: a.id, key: a.key, season: a.season, entries: a.entries, locked: !a.locked }); toast(a.locked ? 'Betting reopened' : 'Betting locked'); delete drafts[a.key]; refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-settle]').forEach((b) => (b.onclick = () => {
    const a = store.awards.find((x) => x.id === b.dataset.settle);
    modal({
      title: `Announce ${esc(a.key)} winner`,
      body: `<div class="small muted mb">Bets on the winner pay out; everything else on this board loses.</div>
        <select id="win">${a.entries.map((e) => `<option value="${e.playerId}">${esc(playerById(e.playerId)?.name || '?')} (${fmtOdds(e.odds)})</option>`).join('')}
        <optgroup label="Someone not on the board">${store.players.filter((p) => !a.entries.some((e) => e.playerId === p.id)).sort((x, y) => x.name.localeCompare(y.name)).map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(teamById(p.teamId)?.abbr || '')}</option>`).join('')}</optgroup></select>`,
      actions: [{ label: 'Cancel' }, { label: '🏆 Announce winner', cls: 'btn gold', onClick: async (close, root) => { await post(`/api/admin/awards/${a.id}/settle`, { playerId: root.querySelector('#win').value }); toast('Winner announced — bets settled'); delete drafts[a.key]; refresh(); } }],
    });
  }));
  el.querySelectorAll('[data-areopen]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Undo winner?', 'Payouts for this award are reversed and the board goes back to open (locked).', { okLabel: 'Undo' }))) return;
    await post(`/api/admin/awards/${b.dataset.areopen}/reopen`); refresh();
  }));
  el.querySelectorAll('[data-adel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Remove this board?', 'Every bet on it is refunded.', { danger: true, okLabel: 'Remove' }))) return;
    const a = store.awards.find((x) => x.id === b.dataset.adel);
    await del(`/api/admin/awards/${a.id}`); delete drafts[a.key]; toast('Board removed'); refresh();
  }));
}

function awardCard(a, season, stats) {
  const live = store.awards.find((x) => x.key === a.key && String(x.season) === String(season));
  const draft = drafts[a.key] || [];
  const r = recs[a.key];
  const eligible = store.players.filter((p) => a.eligible(p)).sort((x, y) => x.name.localeCompare(y.name));
  const status = !live ? '<span class="badge">Not posted</span>' : live.status === 'settled' ? `<span class="badge gold">Winner: ${esc(playerById(live.winnerId)?.name || '?')}</span>` : live.locked ? '<span class="badge gold">Locked</span>' : '<span class="badge green">Live</span>';
  const statLine = (pid) => {
    const s = stats.players?.[pid];
    if (!s) return '';
    const keys = Object.keys(s).filter((k) => STATS[k] && Number(s[k])).slice(0, 5);
    return keys.map((k) => `${s[k]} ${STATS[k].short}`).join(' · ');
  };
  return `<div class="card">
    <div class="row between wrap mb"><div class="row">${trophySvg('trophy')}<div><div class="pixel" style="font-size:15px">${esc(a.name)}</div><div class="small muted">${esc(a.full)} — ${esc(a.desc)}</div></div></div>
      <div class="row wrap">${status}
        <button class="btn sm" data-rec="${a.key}">${icon('wand')} Recommend</button>
        ${live && live.status !== 'settled' ? `<button class="btn sm" data-alock="${live.id}">${icon(live.locked ? 'unlock' : 'lock')} ${live.locked ? 'Unlock' : 'Lock'}</button><button class="btn sm gold" data-settle="${live.id}">🏆 Winner</button>` : ''}
        ${live && live.status === 'settled' ? `<button class="btn sm" data-areopen="${live.id}">Undo winner</button>` : ''}
        ${live ? `<button class="btn sm danger" data-adel="${live.id}">${icon('trash')}</button>` : ''}</div></div>

    ${r ? `<div class="card flat tight mb" style="border-color:rgba(167,139,250,.4)">
      <div class="row between mb" style="margin-bottom:6px"><b class="row">${icon('wand', 'ico i-md')} Recommended for ${esc(a.name)}</b><button class="btn xs ghost" data-hiderec="${a.key}">Hide</button></div>
      ${r.length ? `${r.map((x, i) => { const p = playerById(x.playerId); return `<div class="rec-row"><input type="checkbox" data-recpick="${a.key}" value="${i}" checked>
        <div style="min-width:0"><div class="row" style="gap:6px">${teamLogo(teamById(p?.teamId), 'sm')}<b class="ellipsis">${esc(p?.name)}</b><span class="pos">${esc(p?.positions.join('/'))}</span>${p?.cls ? `<span class="tiny muted">${esc(p.cls)}</span>` : ''}</div><div class="tiny muted ellipsis">${esc(statLine(x.playerId))}</div></div>
        <div class="tiny muted num">score ${x.score}</div><div class="num bold green">${fmtOdds(x.odds)}</div><div></div></div>`; }).join('')}
        <button class="btn sm primary mt" data-userec="${a.key}">${icon('check')} Add checked to board</button>`
        : '<div class="small muted">No eligible players with stats yet.</div>'}</div>` : ''}

    ${draft.length ? `<div class="table-wrap"><table class="t compact"><thead><tr><th>Player</th><th>Team</th><th class="center">Odds</th><th></th></tr></thead><tbody>
      ${draft.map((d, i) => { const p = playerById(d.playerId); return `<tr><td><b>${esc(p?.name || 'Removed player')}</b> <span class="pos">${esc(p?.positions.join('/') || '')}</span></td><td class="small">${esc(teamById(p?.teamId)?.name || '')}</td>
        <td class="center"><input class="xs" data-odds="${a.key}:${i}" value="${d.odds != null ? fmtOdds(d.odds) : ''}"></td><td class="right"><button class="btn xs ghost" data-rm="${a.key}:${i}">${icon('x', 'ico i-sm')}</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="small muted">No players on this board yet.</div>'}
    <div class="row wrap mt">
      <select class="sm" data-addp="${a.key}" style="width:auto;max-width:280px"><option value="">+ Add eligible player…</option>${eligible.filter((p) => !draft.some((d) => d.playerId === p.id)).map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(teamById(p.teamId)?.abbr || '')} ${esc(p.positions.join('/'))}</option>`).join('')}</select>
      <span class="grow"></span>
      ${live?.status !== 'settled' ? `<button class="btn primary sm" data-post="${a.key}">${icon('check')} ${live ? 'Update board' : 'Post odds'}</button>` : ''}
    </div>
  </div>`;
}
