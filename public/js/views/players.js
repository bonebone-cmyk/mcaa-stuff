import { store, api, esc, icon, teamById, playerById, teamLogo, emptyState, loadStats, fmtStat, statLabel, weekLabel, weekSort } from '../core.js';
import { STATS, STAT_CATEGORIES, POSITION_LIST, positionGroups, statsForPositions, AWARD_BY_KEY } from '../shared.js';
import { oddsBtn } from '../slip.js';

const state = { q: '', team: '', pos: '' };

export async function viewPlayers(el) {
  const draw = () => {
    const q = state.q.toLowerCase();
    const list = store.players.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) && (!state.team || p.teamId === state.team) && (!state.pos || p.positions.includes(state.pos)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const shown = list.slice(0, 300);
    el.querySelector('#plist').innerHTML = list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Team</th><th>Pos</th><th>Class</th><th>#</th></tr></thead><tbody>
      ${shown.map((p) => { const t = teamById(p.teamId); return `<tr><td><a href="#/player/${p.id}"><b>${esc(p.name)}</b></a></td><td><div class="row">${teamLogo(t, 'sm')}<span class="ellipsis">${esc(t?.name || '')}</span></div></td>
        <td>${p.positions.map((x) => `<span class="pos">${esc(x)}</span>`).join(' ')}</td><td>${esc(p.cls || '—')}</td><td class="jersey">${p.number ?? '—'}</td></tr>`; }).join('')}
      </tbody></table></div>${list.length > shown.length ? `<div class="small muted mt center">Showing first ${shown.length} of ${list.length}. Narrow your search.</div>` : ''}`
      : store.players.length ? '<div class="muted center" style="padding:30px">No players match.</div>' : emptyState('No players yet', store.user.isAdmin ? 'Import team rosters in Admin → Rosters.' : 'Rosters will appear once the league adds them.', 'users');
  };
  const positions = POSITION_LIST.filter((p) => store.players.some((x) => x.positions.includes(p)));
  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">MCAA rosters</div><h1>Players</h1><div class="sub">${store.players.length} players</div></div></div>
    <div class="row wrap mb">
      <div class="search grow" style="min-width:200px">${icon('search')}<input type="search" id="pq" placeholder="Search players…" value="${esc(state.q)}"></div>
      <select id="pt" style="width:auto"><option value="">All teams</option>${[...store.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${state.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select id="pp" style="width:auto"><option value="">All positions</option>${positions.map((p) => `<option ${state.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    </div>
    <div id="plist"></div>`;
  el.querySelector('#pq').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  el.querySelector('#pt').addEventListener('change', (e) => { state.team = e.target.value; draw(); });
  el.querySelector('#pp').addEventListener('change', (e) => { state.pos = e.target.value; draw(); });
  draw();
}

export async function viewPlayer(el, id) {
  const p = playerById(id);
  if (!p) { el.innerHTML = emptyState('Player not found', '', 'warn'); return; }
  const t = teamById(p.teamId);
  const season = store.ui.season;
  let stats = {};
  try { stats = (await loadStats(season)).players[p.id] || {}; } catch {}
  const eligible = statsForPositions(p.positions);
  const statKeys = [...new Set([...eligible, ...Object.keys(stats).filter((k) => STATS[k])])];
  const cats = STAT_CATEGORIES.map(([cat, label]) => {
    const keys = statKeys.filter((k) => STATS[k].cat === cat && stats[k] != null);
    if (!keys.length) return '';
    return `<div class="card tight"><div class="small bold muted mb" style="margin-bottom:8px">${label}</div><div class="stat-tiles" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
      ${keys.map((k) => `<div class="tile" style="padding:10px"><div class="k">${esc(STATS[k].short)}</div><div class="v" style="font-size:20px">${fmtStat(k, stats[k])}</div></div>`).join('')}</div></div>`;
  }).join('');

  const props = store.props.filter((pr) => pr.playerId === p.id && pr.status === 'open');
  const awards = store.awards.filter((a) => a.status === 'open' && a.entries.some((e) => e.playerId === p.id));

  el.innerHTML = `
    <div class="row mb"><a class="btn ghost sm" href="#/players">← Players</a>${store.user.isAdmin ? `<button class="btn sm" style="margin-left:auto" id="edit-pl">${icon('edit')} Edit player</button>` : ''}</div>
    <div class="player-hero">
      <div class="big-jersey" style="border-color:${esc(t?.color || '')}">${p.number != null && p.number !== '' ? '#' + esc(p.number) : icon('user')}</div>
      <div class="grow"><h1 style="margin:0;font-size:30px">${esc(p.name)}</h1>
        <div class="row wrap mt" style="margin-top:6px">${p.positions.map((x) => `<span class="pos">${esc(x)}</span>`).join('')}${p.cls ? `<span class="badge">${esc(p.cls)}</span>` : ''}
        <a class="row" href="#/team/${t?.id}" style="gap:6px">${teamLogo(t, 'sm')}${esc(t?.name || '')}</a></div></div>
    </div>
    ${awards.length ? `<div class="section-title">Award odds</div><div class="grid grid-auto">${awards.map((a) => {
      const e = a.entries.find((x) => x.playerId === p.id);
      return `<div class="card tight row between"><div><div class="bold">${esc(AWARD_BY_KEY[a.key]?.name)}</div><div class="small muted">${esc(AWARD_BY_KEY[a.key]?.full)}</div></div><div style="width:96px">${oddsBtn({ market: 'award', awardId: a.id, pick: p.id }, { odds: e.odds, locked: a.locked })}</div></div>`;
    }).join('')}</div>` : ''}
    ${props.length ? `<div class="section-title">Open props</div><div class="card"><div class="mk-grid"><div></div><div class="hd">Over</div><div class="hd">Under</div>
      ${props.map((pr) => `<div class="lbl"><span>${esc(statLabel(pr.stat))}</span><a class="small" href="#/game/${pr.gameId}">game</a></div>
        ${oddsBtn({ market: 'prop', propId: pr.id, pick: 'over' }, { line: pr.line, odds: pr.over, locked: pr.locked })}
        ${oddsBtn({ market: 'prop', propId: pr.id, pick: 'under' }, { line: pr.line, odds: pr.under, locked: pr.locked })}`).join('')}</div></div>` : ''}
    <div class="section-title">${esc(season)} season stats${stats.gp ? ` · ${stats.gp} game${stats.gp === 1 ? '' : 's'}` : ''}</div>
    ${cats ? `<div class="col">${cats}</div>` : '<div class="muted">No stats recorded yet.</div>'}
    <div id="gamelog"></div>`;

  el.querySelector('#edit-pl')?.addEventListener('click', async () => {
    const { editPlayerModal } = await import('../admin/rosters.js');
    editPlayerModal(p, () => viewPlayer(el, id));
  });

  // game log
  const games = store.games.filter((g) => String(g.season) === String(season) && (g.homeId === p.teamId || g.awayId === p.teamId) && g.status === 'final').sort((a, b) => weekSort(a.week, b.week));
  const logRows = [];
  for (const g of games) {
    try {
      const box = await api(`/api/games/${g.id}/box`);
      const s = box.players[p.id];
      if (s) logRows.push({ g, s });
    } catch {}
  }
  if (logRows.length) {
    const keys = statKeys.filter((k) => !STATS[k].derived && logRows.some((r) => r.s[k] != null));
    el.querySelector('#gamelog').innerHTML = `<div class="section-title">Game log</div><div class="table-wrap"><table class="t compact"><thead><tr><th>Week</th><th>Opp</th>${keys.map((k) => `<th class="num" title="${esc(STATS[k].label)}">${esc(STATS[k].short)}</th>`).join('')}</tr></thead><tbody>
      ${logRows.map(({ g, s }) => { const opp = teamById(g.homeId === p.teamId ? g.awayId : g.homeId); return `<tr><td>${esc(weekLabel(g.week))}</td><td><a href="#/game/${g.id}">${esc(opp?.abbr || opp?.name || '')}</a></td>${keys.map((k) => `<td class="num">${fmtStat(k, s[k])}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>`;
  }
  void positionGroups;
}
