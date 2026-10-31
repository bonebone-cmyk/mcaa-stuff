import { store, api, esc, icon, teamById, playerById, gameById, teamLogo, teamRecords, recStr, weekLabel, statLabel, fmtStat, fmtOdds, teamGradient, coins, emptyState, toast } from '../core.js';
import { STATS, STAT_CATEGORIES, statsForPositions } from '../shared.js';
import { oddsBtn, toggleSel } from '../slip.js';
import { gameMeta, statusBadge } from './common.js';

let propTeam = 'all';

export async function viewGame(el, id) {
  const g = gameById(id);
  if (!g) { el.innerHTML = emptyState('Game not found', 'This game may have been removed.', 'warn'); return; }
  const h = teamById(g.homeId), a = teamById(g.awayId);
  const L = g.lines || {};
  const final = g.status === 'final';
  const locked = g.locked || g.status !== 'scheduled';
  const records = teamRecords(g.season);
  const props = store.props.filter((p) => p.gameId === g.id);
  const playerProps = props.filter((p) => p.kind === 'player');
  const gameProps = props.filter((p) => p.kind === 'game');

  const side = (t, score, won) => `<div class="side">${teamLogo(t, 'xl')}<a class="nm" style="color:var(--text)" href="#/team/${t?.id}">${esc(t?.name || 'TBD')}</a><div class="small muted num">${recStr(records[t?.id])}</div></div>`;

  const header = `<section class="matchup">
    <div class="bg" style="${teamGradient(h, a)}"></div>
    <div class="inner">
      ${side(a)}
      <div class="mid">
        <div class="row" style="justify-content:center;margin-bottom:8px">${g.gotw ? '<span class="badge gold">★ Game of the Week</span>' : ''}${statusBadge(g)}</div>
        ${final ? `<div class="sc">${g.awayScore} – ${g.homeScore}</div>` : `<div class="gotw-vs">${g.neutral ? 'VS' : 'AT'}</div>`}
        <div class="small muted mt">${esc(weekLabel(g.week))} · ${esc(g.season)}</div>
      </div>
      ${side(h)}
    </div>
    <div class="meta">${gameMeta(g).map((m) => `<span>${m}</span>`).join('') || '<span>Time TBA</span>'}${g.note ? `<span>${esc(g.note)}</span>` : ''}</div>
  </section>`;

  const lockedNote = locked && !final ? `<div class="callout warn mb">${icon('lock')}<div>Betting is locked for this game${g.status === 'cancelled' ? ' (cancelled — all bets refunded)' : ''}.</div></div>` : '';

  // ---- main lines
  const mainLines = `<details class="market" open><summary>Game Lines</summary><div class="mb">
    <div class="mk-grid" style="grid-template-columns:minmax(0,1fr) 110px 110px 110px">
      <div></div><div class="hd">Spread</div><div class="hd">Moneyline</div><div class="hd">Total</div>
      <div class="lbl">${teamLogo(a, 'sm')}<span class="ellipsis">${esc(a?.name)}</span></div>
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'away' }, { line: L.spread ? -L.spread.home : null, odds: L.spread?.awayOdds, locked })}
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'away' }, { odds: L.ml?.away, locked })}
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'over' }, { line: L.total?.line, odds: L.total?.over, locked })}
      <div class="lbl">${teamLogo(h, 'sm')}<span class="ellipsis">${esc(h?.name)}</span></div>
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'home' }, { line: L.spread?.home, odds: L.spread?.homeOdds, locked })}
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'home' }, { odds: L.ml?.home, locked })}
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'under' }, { line: L.total?.line, odds: L.total?.under, locked })}
    </div></div></details>`;

  const teamTotals = (L.homeTotal || L.awayTotal) ? `<details class="market" open><summary>Team Total Points</summary><div class="mb">
    <div class="mk-grid"><div></div><div class="hd">Over</div><div class="hd">Under</div>
      ${[[a, 'awayTotal'], [h, 'homeTotal']].map(([t, k]) => `<div class="lbl">${teamLogo(t, 'sm')}<span class="ellipsis">${esc(t?.name)}</span></div>
        ${oddsBtn({ market: k, gameId: g.id, pick: 'over' }, { line: L[k]?.line, odds: L[k]?.over, locked })}
        ${oddsBtn({ market: k, gameId: g.id, pick: 'under' }, { line: L[k]?.line, odds: L[k]?.under, locked })}`).join('')}
    </div></div></details>` : '';

  const exact = L.exact ? `<details class="market" open><summary><span>Exact Score <span class="badge purple">${fmtOdds(L.exact.odds)}</span></span></summary><div class="mb">
    <div class="small muted mb">Call the exact final score. Hit it on the nose and get paid at ${fmtOdds(L.exact.odds)}.</div>
    <div class="exact-box">
      <label class="f"><span class="lbl">${esc(a?.name)}</span><input type="number" min="0" id="ex-away" placeholder="0" ${locked ? 'disabled' : ''}></label>
      <div class="pixel muted" style="padding-bottom:10px">–</div>
      <label class="f"><span class="lbl">${esc(h?.name)}</span><input type="number" min="0" id="ex-home" placeholder="0" ${locked ? 'disabled' : ''}></label>
      <button class="btn primary" id="ex-add" ${locked ? 'disabled' : ''}>${locked ? icon('lock') : icon('plus')} Add to slip</button>
    </div></div></details>` : '';

  // ---- player props
  let propsHtml = '';
  if (playerProps.length) {
    const teams = [a, h].filter(Boolean);
    const shown = playerProps.filter((p) => propTeam === 'all' || playerById(p.playerId)?.teamId === propTeam);
    const byPlayer = new Map();
    for (const p of shown) {
      if (!byPlayer.has(p.playerId)) byPlayer.set(p.playerId, []);
      byPlayer.get(p.playerId).push(p);
    }
    const rows = [...byPlayer.entries()].map(([pid, list]) => {
      const pl = playerById(pid);
      const t = teamById(pl?.teamId);
      return `<div class="card flat tight" style="margin-bottom:8px">
        <div class="row mb" style="margin-bottom:8px">${teamLogo(t, 'sm')}<a class="bold" style="color:var(--text)" href="#/player/${pid}">${esc(pl?.name || 'Player')}</a>
          ${(pl?.positions || []).map((x) => `<span class="pos">${esc(x)}</span>`).join('')}${pl?.number ? `<span class="jersey small">#${esc(pl.number)}</span>` : ''}</div>
        <div class="mk-grid"><div></div><div class="hd">Over</div><div class="hd">Under</div>
        ${list.map((p) => `<div class="lbl"><span>${esc(statLabel(p.stat))}</span>${p.status === 'settled' ? `<span class="badge blue">Result: ${fmtStat(p.stat, p.result)}</span>` : p.status === 'void' ? '<span class="badge">Void</span>' : ''}</div>
          ${oddsBtn({ market: 'prop', propId: p.id, pick: 'over' }, { line: p.line, odds: p.over, locked: locked || p.status !== 'open' || p.locked })}
          ${oddsBtn({ market: 'prop', propId: p.id, pick: 'under' }, { line: p.line, odds: p.under, locked: locked || p.status !== 'open' || p.locked })}`).join('')}
        </div></div>`;
    }).join('');
    propsHtml = `<details class="market" open><summary>Player Props <span class="badge">${playerProps.length}</span></summary><div class="mb">
      <div class="prop-filter"><button class="chip ${propTeam === 'all' ? 'on' : ''}" data-pt="all">All players</button>
        ${teams.map((t) => `<button class="chip ${propTeam === t.id ? 'on' : ''}" data-pt="${t.id}">${esc(t.name)}</button>`).join('')}</div>
      ${rows || '<div class="muted small">No props for this team.</div>'}</div></details>`;
  }

  const gamePropsHtml = gameProps.length ? `<details class="market" open><summary>Game Stat Over/Unders <span class="badge">${gameProps.length}</span></summary><div class="mb">
    <div class="mk-grid"><div></div><div class="hd">Over</div><div class="hd">Under</div>
    ${gameProps.map((p) => `<div class="lbl"><span>${esc(p.label)}</span>${p.status === 'settled' ? `<span class="badge blue">Result: ${p.result}</span>` : p.status === 'void' ? '<span class="badge">Void</span>' : ''}</div>
      ${oddsBtn({ market: 'prop', propId: p.id, pick: 'over' }, { line: p.line, odds: p.over, locked: locked || p.status !== 'open' || p.locked })}
      ${oddsBtn({ market: 'prop', propId: p.id, pick: 'under' }, { line: p.line, odds: p.under, locked: locked || p.status !== 'open' || p.locked })}`).join('')}
    </div></div></details>` : '';

  const noMarkets = !L.ml && !L.spread && !L.total && !L.homeTotal && !L.awayTotal && !L.exact && !props.length;

  el.innerHTML = `
    <div class="row mb"><a class="btn ghost sm" href="#/">← Sportsbook</a>${store.user.isAdmin ? `<a class="btn sm" href="#/admin/lines/${g.id}" style="margin-left:auto">${icon('edit')} Edit lines</a>` : ''}</div>
    ${header}
    ${lockedNote}
    ${noMarkets && !final ? `<div class="callout info mb">${icon('info')}<div>Odds for this game haven't been posted yet. Check back soon!</div></div>` : ''}
    ${!final || L.ml || L.spread || L.total ? mainLines : ''}
    ${teamTotals}
    ${exact}
    ${propsHtml}
    ${gamePropsHtml}
    <div id="trend" class="small muted center mt"></div>
    <div id="box"></div>`;

  el.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => { propTeam = b.dataset.pt; viewGame(el, id); }));
  el.querySelector('#ex-add')?.addEventListener('click', () => {
    const hv = el.querySelector('#ex-home').value, av = el.querySelector('#ex-away').value;
    if (hv === '' || av === '') return toast('Enter a score for both teams', 'err');
    toggleSel({ market: 'exact', gameId: g.id, pick: 'exact', odds: L.exact.odds, line: null, exact: { home: Number(hv), away: Number(av) } });
    toast('Exact score added to your slip');
  });

  api('/api/game-bets/' + g.id).then((t) => {
    const tr = el.querySelector('#trend');
    if (tr && t.count) tr.innerHTML = `${icon('chart', 'ico i-md')} ${t.count} bet${t.count === 1 ? '' : 's'} placed on this game · ${coins(t.handle)} coins wagered`;
  }).catch(() => {});

  // box score
  try {
    const box = await api(`/api/games/${g.id}/box`);
    const ids = Object.keys(box.players || {});
    if (!ids.length) return;
    const boxEl = el.querySelector('#box');
    const sections = [a, h].filter(Boolean).map((t) => {
      const players = ids.map((pid) => playerById(pid)).filter((p) => p && p.teamId === t.id);
      if (!players.length) return '';
      const cats = STAT_CATEGORIES.map(([cat, label]) => {
        const keys = Object.keys(STATS).filter((k) => STATS[k].cat === cat && !STATS[k].derived);
        const rows = players.filter((p) => keys.some((k) => box.players[p.id][k] != null));
        if (!rows.length) return '';
        const cols = keys.filter((k) => rows.some((p) => box.players[p.id][k] != null));
        return `<div class="small bold muted" style="margin:10px 0 6px">${label}</div><div class="table-wrap"><table class="t compact"><thead><tr><th>Player</th>${cols.map((k) => `<th class="num" title="${esc(STATS[k].label)}">${esc(STATS[k].short)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((p) => `<tr><td><a href="#/player/${p.id}">${esc(p.name)}</a></td>${cols.map((k) => `<td class="num">${fmtStat(k, box.players[p.id][k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }).join('');
      return `<div class="card mt"><h3 class="row">${teamLogo(t, 'sm')} ${esc(t.name)} box score</h3>${cats}</div>`;
    }).join('');
    boxEl.innerHTML = `<div class="section-title">Box Score</div>${sections}`;
  } catch {}
}
