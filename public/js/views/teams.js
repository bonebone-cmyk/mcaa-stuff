import { store, esc, icon, teamById, teamLogo, teamRecords, recStr, weekLabel, weekSort, fmtDate, emptyState, groupBy, loadStats, fmtStat } from '../core.js';
import { POSITION_LIST, STATS } from '../shared.js';

export async function viewTeams(el) {
  const season = store.ui.season;
  const rec = teamRecords(season);
  const confs = groupBy([...store.teams].sort((a, b) => a.name.localeCompare(b.name)), (t) => t.conference || '');
  const sortedConfs = [...confs.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${esc(season)} season</div><h1>Teams</h1><div class="sub">${store.teams.length} team${store.teams.length === 1 ? '' : 's'} in the MCAA</div></div>
      ${store.user.isAdmin ? `<a class="btn" href="#/admin/teams">${icon('plus')} Manage teams</a>` : ''}</div>
    ${store.teams.length ? sortedConfs.map((c) => {
      const list = confs.get(c).sort((a, b) => {
        const ra = rec[a.id] || { w: 0, l: 0 }, rb = rec[b.id] || { w: 0, l: 0 };
        return (rb.w - rb.l) - (ra.w - ra.l) || a.name.localeCompare(b.name);
      });
      return `${sortedConfs.length > 1 || c ? `<div class="section-title">${esc(c || 'Independent')}</div>` : ''}
      <div class="grid grid-auto">${list.map((t) => `<a class="team-tile" href="#/team/${t.id}" style="--tc:${esc(t.color || '#3ee08f')}">${teamLogo(t, 'lg')}
        <div class="grow" style="min-width:0"><div class="nm ellipsis">${esc(t.name)}</div><div class="sub">${esc(t.mascot || '')}${t.mascot ? ' · ' : ''}<span class="num">${recStr(rec[t.id])}</span></div></div></a>`).join('')}</div>`;
    }).join('') : emptyState('No teams yet', store.user.isAdmin ? 'Add your league teams (and their logos) in Admin → Teams.' : 'Teams will show up once the league adds them.', 'shield')}`;
}

export async function viewTeam(el, id) {
  const t = teamById(id);
  if (!t) { el.innerHTML = emptyState('Team not found', '', 'warn'); return; }
  const season = store.ui.season;
  const rec = teamRecords(season)[t.id];
  const roster = store.players.filter((p) => p.teamId === t.id).sort((a, b) => {
    const pa = POSITION_LIST.indexOf(a.positions[0]), pb = POSITION_LIST.indexOf(b.positions[0]);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.name.localeCompare(b.name);
  });
  const games = store.games.filter((g) => String(g.season) === String(season) && (g.homeId === t.id || g.awayId === t.id))
    .sort((a, b) => weekSort(a.week, b.week));
  let stats = null;
  try { stats = await loadStats(season); } catch {}
  const teamStat = stats?.teams?.[t.id];
  const custom = teamStat?.custom || {};

  // team leaders
  const leaders = [];
  if (stats) {
    for (const k of ['pass_yds', 'rush_yds', 'rec_yds', 'tackles', 'sacks', 'def_int']) {
      let best = null;
      for (const p of roster) {
        const v = Number(stats.players[p.id]?.[k]) || 0;
        if (v > 0 && (!best || v > best.v)) best = { p, v };
      }
      if (best) leaders.push({ k, ...best });
    }
  }

  el.innerHTML = `
    <div class="row mb"><a class="btn ghost sm" href="#/teams">← Teams</a>${store.user.isAdmin ? `<a class="btn sm" style="margin-left:auto" href="#/admin/rosters/${t.id}">${icon('edit')} Edit roster</a>` : ''}</div>
    <section class="team-hero" style="border-color:${esc(t.color || '')}55">
      <div class="bg" style="background:linear-gradient(120deg, ${esc(t.color || '#3ee08f')}, transparent 70%)"></div>
      ${teamLogo(t, 'xl')}
      <div class="grow"><div class="eyebrow">${esc(t.conference || 'MCAA')}</div><h1>${esc(t.name)}</h1><div class="muted">${esc(t.mascot || '')}</div></div>
      <div class="stat-tiles" style="min-width:min(100%,360px)">
        <div class="tile"><div class="k">Record</div><div class="v">${recStr(rec)}</div></div>
        <div class="tile"><div class="k">PF</div><div class="v">${rec?.pf ?? 0}</div></div>
        <div class="tile"><div class="k">PA</div><div class="v">${rec?.pa ?? 0}</div></div>
      </div>
    </section>

    ${leaders.length ? `<div class="section-title">Team leaders</div><div class="stat-tiles">${leaders.map((l) => `<a class="tile" style="text-decoration:none;color:var(--text)" href="#/player/${l.p.id}"><div class="k">${esc(STATS[l.k].label)}</div><div class="v">${fmtStat(l.k, l.v)}</div><div class="small muted ellipsis">${esc(l.p.name)}</div></a>`).join('')}</div>` : ''}

    ${Object.keys(custom).length ? `<div class="section-title">Team stats</div><div class="stat-tiles">${Object.entries(custom).map(([k, v]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)) : v)}</div></div>`).join('')}</div>` : ''}

    <div class="section-title">Schedule</div>
    ${games.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Week</th><th>Opponent</th><th>When</th><th>Result</th><th></th></tr></thead><tbody>
      ${games.map((g) => {
        const home = g.homeId === t.id;
        const opp = teamById(home ? g.awayId : g.homeId);
        const my = home ? g.homeScore : g.awayScore, their = home ? g.awayScore : g.homeScore;
        const res = g.status === 'final' ? `<span class="${my > their ? 'green' : my < their ? 'red' : ''} bold">${my > their ? 'W' : my < their ? 'L' : 'T'}</span> <span class="num">${my}-${their}</span>` : g.status === 'cancelled' ? 'Cancelled' : '<span class="muted">—</span>';
        return `<tr><td class="nowrap">${esc(weekLabel(g.week))}${g.gotw ? ' <span class="badge gold">★</span>' : ''}</td>
          <td><div class="row">${home || g.neutral ? (g.neutral ? 'vs' : 'vs') : '@'} ${teamLogo(opp, 'sm')}<a href="#/team/${opp?.id}">${esc(opp?.name || 'TBD')}</a></div></td>
          <td class="muted nowrap">${[g.date ? fmtDate(g.date) : '', esc(g.time || '')].filter(Boolean).join(' · ')}</td><td>${res}</td><td class="right"><a href="#/game/${g.id}">View</a></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="muted">No games scheduled this season.</div>'}

    <div class="section-title">Roster · ${roster.length}</div>
    ${roster.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Class</th></tr></thead><tbody>
      ${roster.map((p) => `<tr><td class="jersey">${p.number != null && p.number !== '' ? esc(p.number) : '—'}</td><td><a href="#/player/${p.id}"><b>${esc(p.name)}</b></a></td>
        <td>${p.positions.map((x) => `<span class="pos">${esc(x)}</span>`).join(' ') || '—'}</td><td>${esc(p.cls || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="muted">No players on this roster yet.</div>'}`;
}
