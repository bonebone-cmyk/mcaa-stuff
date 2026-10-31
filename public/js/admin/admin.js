import { store, esc, icon, coins, weekLabel, currentWeek } from '../core.js';
import { renderTeams } from './teams.js';
import { renderRosters } from './rosters.js';
import { renderSchedule } from './schedule.js';
import { renderLines } from './lines.js';
import { renderResults } from './results.js';
import { renderStats } from './stats.js';
import { renderAwards } from './awards.js';
import { renderUsers } from './users.js';
import { renderSettings } from './settings.js';
import { renderSpecials } from './specials.js';

const TABS = [
  { key: 'overview', label: 'Overview', ico: 'chart' },
  { key: 'teams', label: 'Teams & Logos', ico: 'shield' },
  { key: 'rosters', label: 'Rosters', ico: 'users' },
  { key: 'schedule', label: 'Schedule & Games', ico: 'calendar' },
  { key: 'lines', label: 'Odds & Lines', ico: 'scale' },
  { key: 'results', label: 'Lock & Final Scores', ico: 'whistle' },
  { key: 'stats', label: 'Import Stats', ico: 'list' },
  { key: 'awards', label: 'Award Odds', ico: 'trophy' },
  { key: 'specials', label: 'Specials', ico: 'star' },
  { key: 'users', label: 'Users & Balances', ico: 'user' },
  { key: 'settings', label: 'Settings & Backup', ico: 'gear' },
];

export async function viewAdmin(el, tab, args) {
  if (!TABS.some((t) => t.key === tab)) tab = 'overview';
  el.innerHTML = `
    <div class="admin-wrap">
      <aside class="admin-side"><div class="hdr">⚙ ADMIN</div>${TABS.map((t) => `<a href="#/admin/${t.key}" class="${t.key === tab ? 'on' : ''}">${icon(t.ico)}${t.label}</a>`).join('')}</aside>
      <section id="admin-body" style="min-width:0"></section>
    </div>`;
  const body = el.querySelector('#admin-body');
  const map = { overview: renderOverview, teams: renderTeams, rosters: renderRosters, schedule: renderSchedule, lines: renderLines, results: renderResults, stats: renderStats, awards: renderAwards, specials: renderSpecials, users: renderUsers, settings: renderSettings };
  await map[tab](body, args || []);
}

export function adminHead(title, sub, actions = '') {
  return `<div class="page-head"><div><div class="eyebrow" style="color:var(--gold)">Admin</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row wrap">${actions}</div></div>`;
}

async function renderOverview(el) {
  const season = store.settings.currentSeason;
  const games = store.games.filter((g) => String(g.season) === String(season));
  const wk = currentWeek(season);
  const noLines = games.filter((g) => g.status === 'scheduled' && !g.lines?.ml && !g.lines?.spread && !g.lines?.total).length;
  const awaiting = games.filter((g) => g.status === 'scheduled' && g.locked).length;
  const finals = games.filter((g) => g.status === 'final').length;
  const steps = [
    { done: store.teams.length > 0, title: 'Add teams & logos', text: `${store.teams.length} teams`, href: '#/admin/teams' },
    { done: store.players.length > 0, title: 'Import rosters', text: `${store.players.length} players`, href: '#/admin/rosters' },
    { done: games.length > 0, title: 'Import the schedule', text: `${games.length} games in ${esc(season)}`, href: '#/admin/schedule' },
    { done: games.length > 0 && noLines === 0, title: 'Post odds & lines', text: noLines ? `${noLines} open game${noLines === 1 ? '' : 's'} without lines` : 'All open games have lines', href: '#/admin/lines' },
    { done: awaiting === 0 && finals > 0, title: 'Lock betting, then enter final scores', text: awaiting ? `${awaiting} locked game${awaiting === 1 ? '' : 's'} waiting for a final` : `${finals} games final`, href: '#/admin/results' },
    { done: false, title: 'Import stats (settles player props)', text: 'Box scores & season stats', href: '#/admin/stats' },
    { done: store.awards.length > 0, title: 'Post award odds', text: `${store.awards.length} award markets`, href: '#/admin/awards' },
    { done: store.specials.length > 0, title: 'Post specials (any yes/no or multiple-choice bet)', text: `${store.specials.filter((x) => x.status === 'open').length} open specials`, href: '#/admin/specials' },
  ];
  el.innerHTML = `
    ${adminHead('League Control Room', `Signed in as <b>${esc(store.user.username)}</b>${store.user.isOwner ? ' (owner)' : ''} · Season ${esc(season)}${wk ? ' · ' + esc(weekLabel(wk)) : ''}`)}
    <div class="stat-tiles mb">
      <div class="tile"><div class="k">Teams</div><div class="v">${store.teams.length}</div></div>
      <div class="tile"><div class="k">Players</div><div class="v">${store.players.length}</div></div>
      <div class="tile"><div class="k">Games (${esc(season)})</div><div class="v">${games.length}</div></div>
      <div class="tile"><div class="k">Open props</div><div class="v">${store.props.filter((p) => p.status === 'open').length}</div></div>
    </div>
    <div class="card"><h3>Weekly game-day flow</h3>
      <div class="col" style="gap:12px">${steps.map((s, i) => `<a class="step" href="${s.href}" style="color:var(--text);text-decoration:none">
        <div class="step-n" style="${s.done ? '' : 'background:var(--panel3);color:var(--muted);border-color:var(--line2)'}">${s.done ? '✓' : i + 1}</div>
        <div class="grow"><div class="bold">${s.title}</div><div class="small muted">${s.text}</div></div>${icon('chevron')}</a>`).join('')}</div>
    </div>
    <div class="callout info mt">${icon('info')}<div>Since all MCAA games are simulated at once: post lines → let people bet → <b>lock the week</b> right before you sim → enter final scores (bets settle instantly) → import box-score stats (player props settle automatically).</div></div>`;
}
