import { store, esc, icon, teamById, playerById, teamLogo, trophySvg, emptyState } from '../core.js';
import { AWARDS, AWARD_BY_KEY } from '../shared.js';
import { oddsBtn } from '../slip.js';
import { seasonSelect } from './common.js';

export async function viewFutures(el) {
  const season = store.ui.season;
  const awards = store.awards.filter((a) => String(a.season) === String(season))
    .sort((x, y) => AWARDS.findIndex((a) => a.key === x.key) - AWARDS.findIndex((a) => a.key === y.key));

  const cards = awards.map((a) => {
    const def = AWARD_BY_KEY[a.key];
    const locked = a.locked || a.status !== 'open';
    const entries = [...a.entries].sort((x, y) => (x.odds < 0 || y.odds < 0 ? x.odds - y.odds : x.odds - y.odds));
    return `<div class="award-card">
      <div class="award-head">${trophySvg()}<div class="grow"><div class="an">${esc(def?.name || a.key)}</div><div class="af">${esc(def?.full || '')} · ${esc(def?.desc || '')}</div></div>
        ${a.status === 'settled' ? '<span class="badge gold">Awarded</span>' : locked ? '<span class="badge">Locked</span>' : '<span class="badge green live">Open</span>'}</div>
      <div class="award-list">
        ${entries.map((e) => {
          const p = playerById(e.playerId);
          const t = teamById(p?.teamId);
          const win = a.winnerId === e.playerId;
          return `<div class="award-entry ${win ? 'winner' : ''}">
            <div class="who">${teamLogo(t, 'sm')}<div style="min-width:0"><a class="nm" style="color:var(--text);display:block" href="#/player/${e.playerId}">${win ? '🏆 ' : ''}${esc(p?.name || 'Unknown')}</a>
              <div class="tiny muted">${(p?.positions || []).join('/')} · ${esc(t?.abbr || t?.name || '')}${p?.cls ? ' · ' + esc(p.cls) : ''}</div></div></div>
            ${oddsBtn({ market: 'award', awardId: a.id, pick: e.playerId }, { odds: e.odds, locked })}
          </div>`;
        }).join('') || '<div class="muted small" style="padding:10px">No players on the board yet.</div>'}
      </div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(season)} season</div><h1>${trophySvg('ico')} Award Odds</h1><div class="sub">Bet on who takes home the hardware. Pays out when the award is announced.</div></div>
      <div class="row">${seasonSelect(season)}</div>
    </div>
    ${awards.length ? `<div class="grid grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))">${cards}</div>`
      : emptyState('No award odds posted yet', store.user.isAdmin ? 'Import player stats, then open Admin → Awards to get recommended candidates and post odds.' : 'Award markets (Craftsman, QBOTY, DPOY and more) will appear here once the league posts them.', 'trophy',
        store.user.isAdmin ? `<div class="mt"><a class="btn primary" href="#/admin/awards">${icon('trophy')} Set award odds</a></div>` : '')}`;
  el.querySelector('#season-sel')?.addEventListener('change', (e) => { store.ui.season = e.target.value; store.ui.week = null; viewFutures(el); });
}
