import { store, esc, icon, teamById, playerById, teamLogo, emptyState, groupBy } from '../core.js';
import { oddsBtn } from '../slip.js';
import { seasonSelect } from './common.js';

export function specialCard(sp) {
  const locked = sp.locked || sp.status !== 'open';
  const t = teamById(sp.teamId);
  const yesNo = sp.options.length === 2;
  const status = sp.status === 'settled' ? '<span class="badge gold">Settled</span>' : locked ? `<span class="badge gold">${icon('lock', 'ico i-sm')} Locked</span>` : '<span class="badge green live">Open</span>';
  const opts = sp.options.map((o) => {
    const won = sp.winnerId === o.id;
    const ot = teamById(o.teamId);
    const op = playerById(o.playerId);
    const label = `${won ? '✓ ' : ''}${o.label}`;
    if (yesNo) {
      return `<div class="sp-opt ${won ? 'winner' : ''}"><div class="sp-lbl">${ot ? teamLogo(ot, 'sm') : ''}<span>${esc(label)}</span></div>${oddsBtn({ market: 'special', specialId: sp.id, pick: o.id }, { odds: o.odds, locked })}</div>`;
    }
    return `<div class="sp-row ${won ? 'winner' : ''}"><div class="sp-lbl">${ot ? teamLogo(ot, 'sm') : ''}<span class="ellipsis">${esc(label)}</span>${op ? `<span class="tiny muted">${esc(teamById(op.teamId)?.abbr || '')}</span>` : ''}</div>
      <div style="width:96px">${oddsBtn({ market: 'special', specialId: sp.id, pick: o.id }, { odds: o.odds, locked })}</div></div>`;
  }).join('');
  return `<div class="sp-card ${sp.featured ? 'featured' : ''}">
    <div class="sp-head">${t ? teamLogo(t) : `<div class="sp-ico">${icon('star')}</div>`}
      <div class="grow" style="min-width:0"><div class="sp-q">${esc(sp.question)}</div>
        <div class="tiny muted">${[sp.category, sp.note].filter(Boolean).map(esc).join(' · ') || 'League special'}</div></div>${status}</div>
    <div class="${yesNo ? 'sp-yn' : 'sp-list'}">${opts}</div>
  </div>`;
}

export function sortSpecials(list) {
  return [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function viewSpecials(el) {
  const season = store.ui.season;
  const list = sortSpecials(store.specials.filter((s) => String(s.season) === String(season)));
  const groups = groupBy(list, (s) => s.category || 'League Specials');
  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(season)} season</div><h1>${icon('star')} Specials</h1><div class="sub">Yes/no and multiple-choice bets on anything in the league: seeds, records, rivalries and more.</div></div>
      <div class="row">${seasonSelect(season)}${store.user.isAdmin ? `<a class="btn" href="#/admin/specials">${icon('plus')} New special</a>` : ''}</div>
    </div>
    ${list.length ? [...groups.entries()].map(([cat, items]) => `<div class="section-title">${esc(cat)}</div>
      <div class="sp-grid">${items.map(specialCard).join('')}</div>`).join('')
      : emptyState('No specials yet', store.user.isAdmin ? 'Create any bet you want, like "Will Fresno be the #1 seed?", in Admin → Specials.' : 'Special bets (like "Will Fresno be the #1 seed?") will show up here when the league posts them.', 'star',
        store.user.isAdmin ? `<div class="mt"><a class="btn primary" href="#/admin/specials">${icon('plus')} Create a special</a></div>` : '')}`;
  el.querySelector('#season-sel')?.addEventListener('change', (e) => { store.ui.season = e.target.value; store.ui.week = null; viewSpecials(el); });
}
