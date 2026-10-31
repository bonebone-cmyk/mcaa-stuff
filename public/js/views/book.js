import { store, esc, icon, teamRecords, weekLabel, weekSort, currentWeek, emptyState, sortGames } from '../core.js';
import { gameCard, gotwHero, seasonSelect } from './common.js';
import { specialCard, sortSpecials } from './specials.js';

export async function viewBook(el) {
  const season = store.ui.season;
  const games = store.games.filter((g) => String(g.season) === String(season));
  const weeks = [...new Set(games.map((g) => String(g.week)))].sort(weekSort);
  let week = store.ui.week;
  if (!week || !weeks.includes(week)) week = store.ui.week = currentWeek(season);
  const records = teamRecords(season);
  const wkGames = games.filter((g) => String(g.week) === String(week)).sort(sortGames);
  const gotw = wkGames.find((g) => g.gotw);
  const rest = wkGames.filter((g) => g !== gotw);
  const openWeeks = new Set(games.filter((g) => g.status === 'scheduled' && !g.locked).map((g) => String(g.week)));
  const openCount = wkGames.filter((g) => g.status === 'scheduled' && !g.locked).length;

  let body;
  if (!store.teams.length || !games.length) {
    body = emptyState('No games on the board yet',
      store.user.isAdmin
        ? 'Add teams and import your season schedule from the Admin panel — they will show up here with odds.'
        : 'Check back soon! Once the league posts games and odds, you can start betting here.',
      'football',
      store.user.isAdmin ? `<div class="row mt" style="justify-content:center"><a class="btn primary" href="#/admin/teams">${icon('shield')} Add teams</a><a class="btn" href="#/admin/schedule">${icon('calendar')} Import schedule</a></div>` : '');
  } else {
    body = `
      <div class="week-bar" role="tablist">${weeks.map((w) => `<button data-week="${esc(w)}" class="${w === String(week) ? 'on' : ''}">${esc(weekLabel(w))}${openWeeks.has(w) ? '<span class="wk-dot"></span>' : ''}</button>`).join('')}</div>
      ${gotw ? gotwHero(gotw, records) : ''}
      ${rest.length ? `<div class="section-title">${esc(weekLabel(week))} · ${rest.length} game${rest.length === 1 ? '' : 's'}</div><div class="games">${rest.map((g) => gameCard(g, records)).join('')}</div>` : ''}
    `;
  }

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(season)} season</div><h1>Sportsbook</h1>
        <div class="sub">${games.length ? `${openCount ? `${openCount} game${openCount === 1 ? '' : 's'} open for betting in ${esc(weekLabel(week))}` : `${esc(weekLabel(week))} — betting closed`}` : 'Bet MCAA games with fake coins.'}</div></div>
      <div class="row">${seasonSelect(season)}</div>
    </div>
    ${body}
    ${specialsStrip(season)}`;

  el.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { store.ui.week = b.dataset.week; viewBook(el); }));
  el.querySelector('#season-sel')?.addEventListener('change', (e) => { store.ui.season = e.target.value; store.ui.week = null; viewBook(el); });
  el.querySelector('.week-bar .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function specialsStrip(season) {
  const open = sortSpecials(store.specials.filter((s) => String(s.season) === String(season) && s.status === 'open' && !s.locked));
  if (!open.length) return '';
  return `<div class="section-title">${icon('star', 'ico i-md')} League Specials</div>
    <div class="sp-grid">${open.slice(0, 3).map(specialCard).join('')}</div>
    ${open.length > 3 ? `<div class="center mt"><a class="btn sm" href="#/specials">See all ${open.length} specials →</a></div>` : ''}`;
}
