import { store, esc, icon, teamById, teamLogo, recStr, fmtDate, weekLabel, teamGradient } from '../core.js';
import { oddsBtn } from '../slip.js';

export function gameMeta(g) {
  const bits = [];
  if (g.date) bits.push(fmtDate(g.date));
  if (g.time) bits.push(esc(g.time));
  if (g.location) bits.push(esc(g.location));
  if (g.broadcast) bits.push(esc(g.broadcast));
  return bits;
}

export function statusBadge(g) {
  if (g.status === 'final') return '<span class="badge">Final</span>';
  if (g.status === 'cancelled') return '<span class="badge red">Cancelled</span>';
  if (g.locked) return `<span class="badge gold">${icon('lock', 'ico i-sm')} Locked</span>`;
  return '<span class="badge green live">Open</span>';
}

export function countMarkets(g) {
  const L = g.lines || {};
  let n = ['ml', 'spread', 'total', 'homeTotal', 'awayTotal', 'exact'].filter((k) => L[k]).length;
  n += store.props.filter((p) => p.gameId === g.id && p.status === 'open').length;
  return n;
}

function teamCell(t, rec, score, lost, g) {
  return `<div class="team-cell ${lost ? 'lost' : ''}">${teamLogo(t)}<div class="grow" style="min-width:0">
      <a class="nm" href="#/team/${t?.id || ''}">${esc(t?.name || 'TBD')}</a><div class="rec">${recStr(rec)}</div></div>
      ${score != null ? `<div class="sc">${score}</div>` : ''}</div>`;
}

export function gameCard(g, records) {
  const h = teamById(g.homeId), a = teamById(g.awayId);
  const L = g.lines || {};
  const final = g.status === 'final';
  const locked = g.locked || g.status !== 'scheduled';
  const meta = gameMeta(g);
  const markets = countMarkets(g);
  const awayLost = final && g.awayScore < g.homeScore, homeLost = final && g.homeScore < g.awayScore;
  let grid;
  if (final || g.status === 'cancelled') {
    grid = `<div class="col" style="gap:2px">${teamCell(a, records[a?.id], final ? g.awayScore : null, awayLost, g)}${teamCell(h, records[h?.id], final ? g.homeScore : null, homeLost, g)}</div>`;
  } else {
    const sp = L.spread, tot = L.total, ml = L.ml;
    grid = `<div class="gcard-grid">
      <div></div><div class="hd">Spread</div><div class="hd">Total</div><div class="hd">Money</div>
      ${teamCell(a, records[a?.id], null, false, g)}
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'away' }, { line: sp ? -sp.home : null, odds: sp?.awayOdds, locked })}
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'over' }, { line: tot?.line, odds: tot?.over, locked })}
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'away' }, { odds: ml?.away, locked })}
      ${teamCell(h, records[h?.id], null, false, g)}
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'home' }, { line: sp?.home, odds: sp?.homeOdds, locked })}
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'under' }, { line: tot?.line, odds: tot?.under, locked })}
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'home' }, { odds: ml?.home, locked })}
    </div>`;
  }
  return `<article class="gcard ${g.gotw ? 'is-gotw' : ''}">
    <div class="gcard-head"><div class="when">${g.gotw ? '<span class="badge gold">★ GOTW</span>' : ''}<span class="ellipsis">${meta.join(' · ') || weekLabel(g.week)}</span></div>${statusBadge(g)}</div>
    <div class="gcard-body">${grid}</div>
    <div class="gcard-foot"><span class="small dim">${g.neutral ? 'Neutral site' : `@ ${esc(h?.name || '')}`}</span>
      <a href="#/game/${g.id}">${final ? 'Results & box score' : markets > 3 ? `All ${markets} markets` : 'Game details'} ${icon('chevron', 'ico i-sm')}</a></div>
  </article>`;
}

export function gotwHero(g, records) {
  const h = teamById(g.homeId), a = teamById(g.awayId);
  const L = g.lines || {};
  const final = g.status === 'final';
  const locked = g.locked || g.status !== 'scheduled';
  const meta = gameMeta(g);
  const side = (t, score) => `<div class="gotw-team">${teamLogo(t, 'xl')}<div class="nm">${esc(t?.name || 'TBD')}</div><div class="rec">${recStr(records[t?.id])}${t?.mascot ? ' · ' + esc(t.mascot) : ''}</div>${score != null ? `<div class="gotw-score">${score}</div>` : ''}</div>`;
  const markets = final ? '' : `<div class="gotw-markets">
    <div class="mk"><div class="mt">Spread</div><div class="opts">
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'away' }, { line: L.spread ? -L.spread.home : null, odds: L.spread?.awayOdds, locked })}
      ${oddsBtn({ market: 'spread', gameId: g.id, pick: 'home' }, { line: L.spread?.home, odds: L.spread?.homeOdds, locked })}</div></div>
    <div class="mk"><div class="mt">Moneyline</div><div class="opts">
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'away' }, { odds: L.ml?.away, locked })}
      ${oddsBtn({ market: 'ml', gameId: g.id, pick: 'home' }, { odds: L.ml?.home, locked })}</div></div>
    <div class="mk"><div class="mt">Total</div><div class="opts">
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'over' }, { line: L.total?.line, odds: L.total?.over, locked })}
      ${oddsBtn({ market: 'total', gameId: g.id, pick: 'under' }, { line: L.total?.line, odds: L.total?.under, locked })}</div></div>
  </div>`;
  return `<section class="gotw">
    <div class="bg" style="${teamGradient(h, a)}"></div>
    <div class="inner">
      <div class="gotw-top"><span class="gotw-badge">★ GAME OF THE WEEK</span><span class="small muted">${meta.join(' · ')}</span>${statusBadge(g)}</div>
      <div class="gotw-teams">${side(a, final ? g.awayScore : null)}<div class="gotw-vs">${final ? 'FINAL' : g.neutral ? 'VS' : 'AT'}</div>${side(h, final ? g.homeScore : null)}</div>
      ${markets}
      <div class="center mt"><a class="btn sm" href="#/game/${g.id}">${final ? 'See results' : 'All markets & player props'} →</a></div>
    </div>
  </section>`;
}

export function seasonSelect(current, id = 'season-sel') {
  if (store.seasons.length < 2) return '';
  return `<select class="sm" id="${id}" style="width:auto">${store.seasons.map((s) => `<option ${String(s) === String(current) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
}
