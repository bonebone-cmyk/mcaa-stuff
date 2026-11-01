import { store, api, post, del, esc, icon, teamById, playerById, gameById, teamLogo, toast, toastErr, confirmBox, loadAll, emptyState, weekLabel, weekSort, currentWeek, fmtOdds, fmtLine, statLabel, fmtStat, formData, gameLabel, modal } from '../core.js';
import { powerRatings, suggestLines, suggestProps, statSeasonsToTry, HOME_FIELD } from './oddsmaker.js';
import { STATS, statsForPositions, moneylineFromSpread, isValidOdds } from '../shared.js';
import { adminHead } from './admin.js';

let wkSel = null, seasonSel = null;
let extras = {}; // gameId -> suggested team totals / exact score from "Suggest lines"

export async function renderLines(el, args = []) {
  if (args[0]) return renderGameLines(el, args[0]);
  seasonSel = seasonSel || store.settings.currentSeason;
  const games = store.games.filter((g) => String(g.season) === String(seasonSel));
  const weeks = [...new Set(games.map((g) => String(g.week)))].sort(weekSort);
  if (!wkSel || !weeks.includes(wkSel)) { wkSel = currentWeek(seasonSel); extras = {}; }
  const list = games.filter((g) => String(g.week) === String(wkSel));
  const open = list.filter((g) => g.status === 'scheduled');
  const ratings = powerRatings(seasonSel);
  const anyRated = store.teams.some((t) => Number(t.rating)) || games.some((g) => g.status === 'final');

  el.innerHTML = `
    ${adminHead('Odds & Lines', 'Let the site suggest lines for the whole week, tweak anything you want, then save.')}
    ${!games.length ? emptyState('No games yet', 'Import or add games first.', 'calendar', '<div class="mt"><a class="btn primary" href="#/admin/schedule">Go to Schedule</a></div>') : `
    <div class="callout info mb">${icon('wand')}<div><b>The fast way:</b> ${anyRated ? '' : '<b>① Rate your teams once</b> (bottom of this page), then '}
      ${anyRated ? '①' : '②'} click <b>✨ Suggest lines</b> → ${anyRated ? '②' : '③'} change anything that looks off → ${anyRated ? '③' : '④'} <b>Save</b>.
      Then <b>✨ Auto player props</b> posts props for every game from player stats.</div></div>
    <div class="row wrap mb">
      <select id="wk" style="width:auto">${weeks.map((w) => `<option value="${esc(w)}" ${w === wkSel ? 'selected' : ''}>${esc(weekLabel(w))}</option>`).join('')}</select>
      <button class="btn gold" data-suggest ${open.length ? '' : 'disabled'}>✨ Suggest lines</button>
      <button class="btn" data-autoprops ${open.length ? '' : 'disabled'}>✨ Auto player props</button>
      <span class="grow"></span>
      <label class="check small"><input type="checkbox" id="with-extras" checked> Include team totals + exact score</label>
      <button class="btn primary" data-save>${icon('check')} Save lines</button>
    </div>
    <div class="table-wrap"><table class="t compact lines-table"><thead><tr>
      <th>Game</th><th class="center">Home spread</th><th class="center">ML away</th><th class="center">ML home</th><th class="center">Total</th>
      <th class="center">Spread juice<br><span class="tiny">away / home</span></th><th class="center">O/U juice<br><span class="tiny">over / under</span></th><th></th></tr></thead><tbody>
      ${list.map((g) => {
        const L = g.lines || {};
        const a = teamById(g.awayId), h = teamById(g.homeId);
        const dis = g.status !== 'scheduled' ? 'disabled' : '';
        const inp = (name, v, ph = '', w = '') => `<input class="xs" ${w ? `style="width:${w}"` : ''} data-g="${g.id}" name="${name}" value="${v != null && v !== '' ? (['mla', 'mlh', 'spa', 'sph', 'ov', 'un'].includes(name) ? fmtOdds(v) : v) : ''}" placeholder="${ph}" ${dis}>`;
        const rh = ratings[g.homeId]?.rating ?? 0, ra = ratings[g.awayId]?.rating ?? 0;
        return `<tr class="line-row">
          <td><div class="row" style="gap:6px">${teamLogo(a, 'sm')}<span class="small"><b>${esc(a?.abbr || a?.name)}</b> @ <b>${esc(h?.abbr || h?.name)}</b></span>${teamLogo(h, 'sm')}
            ${g.locked && g.status === 'scheduled' ? '<span class="badge gold">Locked</span>' : g.status === 'final' ? '<span class="badge">Final</span>' : ''}${extras[g.id] ? '<span class="badge purple" title="Team totals + exact score will be posted too">✨</span>' : ''}</div>
            <div class="tiny dim" style="margin-top:2px">ratings ${fmtRating(ra)} / ${fmtRating(rh)}</div></td>
          <td class="center">${inp('sp', L.spread?.home, '-3.5')}</td>
          <td class="center">${inp('mla', L.ml?.away, 'auto')}</td><td class="center">${inp('mlh', L.ml?.home, 'auto')}</td>
          <td class="center">${inp('tot', L.total?.line, '48.5')}</td>
          <td class="center nowrap">${inp('spa', L.spread?.awayOdds, '-110', '58px')} ${inp('sph', L.spread?.homeOdds, '-110', '58px')}</td>
          <td class="center nowrap">${inp('ov', L.total?.over, '-110', '58px')} ${inp('un', L.total?.under, '-110', '58px')}</td>
          <td class="right"><a class="btn xs" href="#/admin/lines/${g.id}">More ${icon('chevron', 'ico i-sm')}</a></td></tr>`;
      }).join('')}
    </tbody></table></div>
    <div class="small muted mt">Just type a spread and a total. Moneylines fill in by themselves and juice defaults to -110. Spread is from the <b>home</b> team's view: home -3.5 means the home team is favored by 3.5. Use “More” for one game's props and extras.</div>
    ${ratingsPanel(ratings, !anyRated)}`}`;

  el.querySelector('#wk')?.addEventListener('change', (e) => { wkSel = e.target.value; extras = {}; renderLines(el); });
  const input = (gid, n) => el.querySelector(`input[data-g="${gid}"][name="${n}"]`);
  const val = (gid, n) => input(gid, n)?.value.trim() ?? '';
  const setv = (gid, n, v) => { const i = input(gid, n); if (i && !i.disabled) i.value = v; };

  // typing a spread fills the moneyline (unless you've typed your own)
  el.querySelectorAll('input[name=sp]').forEach((i) => i.addEventListener('input', () => {
    const gid = i.dataset.g;
    const ml = i.value.trim() !== '' && Number.isFinite(Number(i.value)) ? moneylineFromSpread(Number(i.value)) : null;
    for (const k of ['mla', 'mlh']) {
      const box = input(gid, k);
      if (box.dataset.manual) continue;
      box.value = ml ? fmtOdds(k === 'mla' ? ml.away : ml.home) : '';
    }
  }));
  el.querySelectorAll('input[name=mla], input[name=mlh]').forEach((i) => i.addEventListener('input', () => { i.dataset.manual = '1'; }));

  el.querySelector('[data-suggest]')?.addEventListener('click', async () => {
    const hasAny = open.some((g) => val(g.id, 'sp') || val(g.id, 'tot') || val(g.id, 'mlh'));
    let mode = 'all';
    if (hasAny) {
      mode = await choose('Some games already have lines', 'Fill in only the games without lines, or replace everything with fresh suggestions?', [['empty', 'Only empty games'], ['all', 'Replace all']]);
      if (!mode) return;
    }
    let n = 0;
    for (const g of open) {
      if (mode === 'empty' && (val(g.id, 'sp') || val(g.id, 'tot') || val(g.id, 'mlh'))) continue;
      const s = suggestLines(g, ratings);
      if (!s) continue;
      setv(g.id, 'sp', s.spread.home); setv(g.id, 'spa', '-110'); setv(g.id, 'sph', '-110');
      setv(g.id, 'mla', fmtOdds(s.ml.away)); setv(g.id, 'mlh', fmtOdds(s.ml.home));
      setv(g.id, 'tot', s.total.line); setv(g.id, 'ov', '-110'); setv(g.id, 'un', '-110');
      extras[g.id] = { homeTotal: s.homeTotal, awayTotal: s.awayTotal, exact: s.exact };
      n++;
    }
    el.querySelectorAll('tr.line-row').forEach((tr) => { const gid = tr.querySelector('input')?.dataset.g; if (extras[gid] && !tr.querySelector('.badge.purple')) tr.querySelector('td .row').insertAdjacentHTML('beforeend', '<span class="badge purple" title="Team totals + exact score will be posted too">✨</span>'); });
    toast(n ? `Suggested lines for ${n} game${n === 1 ? '' : 's'}. Review them, then click Save lines.` : 'Nothing to fill in');
  });

  el.querySelector('[data-autoprops]')?.addEventListener('click', () => autoPropsModal(open, () => renderLines(el)));

  el.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    const withExtras = el.querySelector('#with-extras').checked;
    const items = [];
    for (const g of open) {
      const L = { ...(g.lines || {}) };
      const n = (k) => { const v = val(g.id, k); return v === '' ? null : Number(v.replace('+', '')); };
      for (const k of ['sp', 'tot', 'mla', 'mlh', 'spa', 'sph', 'ov', 'un']) {
        const v = n(k);
        if (v != null && !Number.isFinite(v)) return toast(`Check the numbers for ${gameLabel(g)}`, 'err');
        if (v != null && ['mla', 'mlh', 'spa', 'sph', 'ov', 'un'].includes(k) && !isValidOdds(v)) return toast(`Odds for ${gameLabel(g)} should look like -110 or +150`, 'err');
      }
      L.spread = n('sp') != null ? { home: n('sp'), homeOdds: n('sph') ?? -110, awayOdds: n('spa') ?? -110 } : null;
      let ml = n('mla') != null || n('mlh') != null ? { away: n('mla'), home: n('mlh') } : null;
      if (!ml && L.spread) ml = moneylineFromSpread(L.spread.home);
      L.ml = ml;
      L.total = n('tot') != null ? { line: n('tot'), over: n('ov') ?? -110, under: n('un') ?? -110 } : null;
      if (withExtras && extras[g.id]) Object.assign(L, extras[g.id]);
      items.push({ gameId: g.id, lines: L });
    }
    e.target.disabled = true;
    try { const r = await post('/api/admin/lines/bulk', { items }); toast(`Lines saved for ${r.updated} games`); extras = {}; await loadAll(); renderLines(el); }
    catch (ex) { toastErr(ex); e.target.disabled = false; }
  });

  // ratings panel
  el.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
    const i = el.querySelector(`input[data-rate="${b.dataset.team}"]`);
    i.value = b.dataset.tier;
  }));
  el.querySelector('[data-save-ratings]')?.addEventListener('click', async () => {
    const out = {};
    el.querySelectorAll('input[data-rate]').forEach((i) => { out[i.dataset.rate] = i.value.trim() === '' ? 0 : Number(i.value); });
    try { await post('/api/admin/teams/ratings', { ratings: out }); toast('Ratings saved. Suggestions will use them.'); await loadAll(); renderLines(el); } catch (e) { toastErr(e); }
  });
}

const fmtRating = (r) => (r > 0 ? '+' : '') + (Math.round(r * 10) / 10);
const TIERS = [['Elite', 12], ['Good', 6], ['Avg', 0], ['Weak', -6], ['Bad', -12]];

function ratingsPanel(ratings, openByDefault) {
  const teams = [...store.teams].sort((a, b) => (ratings[b.id]?.rating ?? 0) - (ratings[a.id]?.rating ?? 0) || a.name.localeCompare(b.name));
  if (!teams.length) return '';
  return `<details class="market mt-lg" ${openByDefault ? 'open' : ''}><summary><span class="row">${icon('chart')} Team power ratings <span class="small muted" style="font-weight:500">— what the suggestions are based on</span></span></summary><div class="mb">
    <div class="small muted mb">A rating means <b>points better than an average team</b>: +7 beats an average team by about 7 on a neutral field. Set your own ratings before the season. Once games are final, results count more and more (blended with yours over the first ~3 games). Home field is worth ${HOME_FIELD} points.</div>
    <div class="table-wrap"><table class="t compact"><thead><tr><th>Team</th><th class="num">Record</th><th class="num">PF/G</th><th class="num">PA/G</th><th class="num">From results</th><th>Your rating</th><th class="num">Used</th></tr></thead><tbody>
    ${teams.map((t) => { const r = ratings[t.id] || {}; return `<tr><td><div class="row">${teamLogo(t, 'sm')}<b>${esc(t.name)}</b></div></td>
      <td class="num">${r.gp ? `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` : '—'}</td><td class="num">${r.pfAvg != null ? r.pfAvg.toFixed(1) : '—'}</td><td class="num">${r.paAvg != null ? r.paAvg.toFixed(1) : '—'}</td>
      <td class="num">${r.gp ? fmtRating(r.auto) : '—'}</td>
      <td class="nowrap"><input class="xs" data-rate="${t.id}" value="${Number(t.rating) || ''}" placeholder="0"> ${TIERS.map(([l, v]) => `<button class="btn xs ghost" data-tier="${v}" data-team="${t.id}" title="${v > 0 ? '+' : ''}${v}">${l}</button>`).join('')}</td>
      <td class="num bold">${fmtRating(r.rating ?? 0)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <button class="btn primary mt" data-save-ratings>${icon('check')} Save ratings</button></div></details>`;
}

/** Small 2–3 choice dialog. Resolves to the chosen key, or null. */
function choose(title, text, options) {
  return new Promise((resolve) => {
    let picked = null;
    modal({
      title, body: `<p style="margin:0">${text}</p>`,
      actions: [{ label: 'Cancel', onClick: () => { picked = null; } }, ...options.map(([k, l], i) => ({ label: l, cls: i === options.length - 1 ? 'btn primary' : 'btn', onClick: () => { picked = k; } }))],
    });
    const root = document.getElementById('modal-root');
    const obs = new MutationObserver(() => { if (!root.querySelector('.modal-back')) { obs.disconnect(); resolve(picked); } });
    obs.observe(root, { childList: true });
  });
}

/** Preview + post suggested player props for a list of games. */
export async function autoPropsModal(games, done) {
  const seasons = statSeasonsToTry();
  let statsSeason = null, stats = null;
  for (const s of seasons) {
    const d = await api('/api/stats?season=' + encodeURIComponent(s)).catch(() => null);
    if (d && Object.keys(d.players || {}).length) { statsSeason = s; stats = d.players; break; }
  }
  if (!stats) {
    modal({ title: '✨ Auto player props', body: `<div class="callout warn">${icon('warn')}<div>There are no player stats yet, so there's nothing to base props on. Import box scores or season stats in <a href="#/admin/stats">Import Stats</a> first (last season's stats work too), or add props by hand on a game's page.</div></div>` });
    return;
  }
  let rows = [];
  for (const g of games) rows.push(...suggestProps(g, stats, statsSeason));
  rows = rows.map((r) => ({ ...r, exists: store.props.some((p) => p.gameId === r.gameId && p.playerId === r.playerId && p.stat === r.stat && p.status === 'open') }));
  rows.forEach((r) => { r.on = !r.exists; });
  if (!rows.length) {
    modal({ title: '✨ Auto player props', body: `<div class="callout warn">${icon('warn')}<div>None of the players in ${games.length === 1 ? 'this game' : 'these games'} have enough stats (from ${esc(statsSeason)}) to suggest props. Check that rosters match the stat sheets.</div></div>` });
    return;
  }
  const byGame = new Map();
  rows.forEach((r, i) => { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(i); });
  modal({
    title: `✨ Suggested player props (${rows.length})`, wide: true,
    body: `<div class="small muted mb">Based on each player's per-game average from the <b>${esc(statsSeason)}</b> season. Lines end in .5 so nobody pushes. Untick anything you don't want, change any line, then post.</div>
      ${[...byGame.entries()].map(([gid, idxs]) => `<div class="bold mt mb" style="margin-bottom:6px">${esc(gameLabel(gameById(gid)))}</div>
        <div class="table-wrap"><table class="t compact"><thead><tr><th></th><th>Player</th><th>Stat</th><th class="num">Avg/game</th><th class="center">Line</th><th class="center">Over</th><th class="center">Under</th></tr></thead><tbody>
        ${idxs.map((i) => { const r = rows[i]; const p = playerById(r.playerId); return `<tr><td><input type="checkbox" data-on="${i}" ${r.on ? 'checked' : ''}></td>
          <td><div class="row" style="gap:6px">${teamLogo(teamById(p?.teamId), 'sm')}<b>${esc(p?.name)}</b><span class="pos">${esc(p?.positions.join('/'))}</span>${r.exists ? '<span class="badge blue">already posted</span>' : ''}</div></td>
          <td>${esc(statLabel(r.stat))}</td><td class="num">${r.avg}</td>
          <td class="center"><input class="xs" data-line="${i}" value="${r.line}"></td><td class="center"><input class="xs" data-ov="${i}" value="-110"></td><td class="center"><input class="xs" data-un="${i}" value="-110"></td></tr>`; }).join('')}
        </tbody></table></div>`).join('')}`,
    actions: [{ label: 'Cancel' }, {
      label: 'Post checked props', cls: 'btn primary', onClick: async (close, root) => {
        const items = [];
        for (let i = 0; i < rows.length; i++) {
          if (!root.querySelector(`[data-on="${i}"]`).checked) continue;
          const line = Number(root.querySelector(`[data-line="${i}"]`).value);
          const over = Number(root.querySelector(`[data-ov="${i}"]`).value.replace(/^\+/, ''));
          const under = Number(root.querySelector(`[data-un="${i}"]`).value.replace(/^\+/, ''));
          if (!Number.isFinite(line) || !isValidOdds(over) || !isValidOdds(under)) { toast(`Check the line/odds for ${playerById(rows[i].playerId)?.name}`, 'err'); return false; }
          items.push({ gameId: rows[i].gameId, playerId: rows[i].playerId, stat: rows[i].stat, line, over, under });
        }
        if (!items.length) { toast('Nothing checked', 'err'); return false; }
        const r = await post('/api/admin/props/bulk', { items });
        toast(`${r.updated} player props posted`);
        await loadAll();
        done?.();
      },
    }],
  });
}

/* ---------------------------------------------------------------- single game */
async function renderGameLines(el, gameId) {
  const g = gameById(gameId);
  if (!g) { el.innerHTML = emptyState('Game not found', '', 'warn'); return; }
  const a = teamById(g.awayId), h = teamById(g.homeId);
  const L = g.lines || {};
  const props = store.props.filter((p) => p.gameId === g.id);
  const roster = store.players.filter((p) => p.teamId === g.homeId || p.teamId === g.awayId).sort((x, y) => (x.teamId === y.teamId ? x.name.localeCompare(y.name) : x.teamId === g.awayId ? -1 : 1));
  const num = (name, v, ph) => `<input class="xs" name="${name}" value="${v ?? ''}" placeholder="${ph}">`;

  el.innerHTML = `
    <div class="row mb"><a class="btn ghost sm" href="#/admin/lines">← All lines</a><a class="btn ghost sm" href="#/game/${g.id}">View as bettor</a></div>
    ${adminHead(`${teamLogo(a, 'sm')} ${esc(a?.name)} @ ${esc(h?.name)} ${teamLogo(h, 'sm')}`, `${esc(weekLabel(g.week))} · ${esc(g.season)} · ${g.status === 'final' ? `Final ${g.awayScore}-${g.homeScore}` : g.locked ? 'Betting locked' : 'Betting open'}`,
      g.status === 'scheduled' ? `<button class="btn" data-lock>${icon(g.locked ? 'unlock' : 'lock')} ${g.locked ? 'Unlock betting' : 'Lock betting'}</button>` : '')}

    <div class="card mb" id="main-lines">
      <div class="row between mb"><h3 style="margin:0">Game lines</h3>${g.status === 'scheduled' ? '<button class="btn gold sm" data-suggest-game>✨ Suggest everything</button>' : ''}</div>
      <div class="grid grid-3">
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">Point spread (home)</div>
          <div class="row wrap gap-sm"><label class="f">Home line${num('sp', L.spread?.home, '-3.5')}</label><label class="f">${esc(a?.abbr || 'Away')} odds${num('spa', L.spread?.awayOdds, '-110')}</label><label class="f">${esc(h?.abbr || 'Home')} odds${num('sph', L.spread?.homeOdds, '-110')}</label></div></div>
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">Moneyline</div>
          <div class="row wrap gap-sm"><label class="f">${esc(a?.abbr || 'Away')}${num('mla', L.ml?.away, '+130')}</label><label class="f">${esc(h?.abbr || 'Home')}${num('mlh', L.ml?.home, '-150')}</label><button class="btn xs" data-ml style="align-self:end">${icon('wand', 'ico i-sm')} From spread</button></div></div>
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">Total points (over/under)</div>
          <div class="row wrap gap-sm"><label class="f">Line${num('tot', L.total?.line, '48.5')}</label><label class="f">Over${num('ov', L.total?.over, '-110')}</label><label class="f">Under${num('un', L.total?.under, '-110')}</label></div></div>
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">${esc(a?.name)} team total</div>
          <div class="row wrap gap-sm"><label class="f">Line${num('att', L.awayTotal?.line, '20.5')}</label><label class="f">Over${num('ato', L.awayTotal?.over, '-110')}</label><label class="f">Under${num('atu', L.awayTotal?.under, '-110')}</label></div></div>
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">${esc(h?.name)} team total</div>
          <div class="row wrap gap-sm"><label class="f">Line${num('htt', L.homeTotal?.line, '27.5')}</label><label class="f">Over${num('hto', L.homeTotal?.over, '-110')}</label><label class="f">Under${num('htu', L.homeTotal?.under, '-110')}</label></div></div>
        <div class="card flat tight"><div class="bold small mb" style="margin-bottom:8px">Exact score</div>
          <div class="row wrap gap-sm"><label class="f">Payout odds${num('ex', L.exact?.odds, '+' + (store.settings.exactScoreOdds || 2500))}</label><button class="btn xs" data-exdef style="align-self:end">Use default</button></div>
          <div class="tiny muted mt">Users type any score; a perfect call pays these odds.</div></div>
      </div>
      <div class="row mt"><button class="btn primary" data-save-lines ${g.status !== 'scheduled' ? 'disabled' : ''}>${icon('check')} Save game lines</button><span class="small muted">Blank = market not offered.</span></div>
    </div>

    <div class="card mb">
      <div class="row between mb"><h3 class="row" style="margin:0">${icon('user')} Player props</h3>${g.status === 'scheduled' && roster.length ? '<button class="btn sm" data-autoprops-game>✨ Auto props for this game</button>' : ''}</div>
      ${roster.length ? `
      <div class="grid grid-2 mb">
        <label class="f"><span class="lbl">Player</span><select id="pp-player"><option value="">Choose a player…</option>
          ${[a, h].map((t) => `<optgroup label="${esc(t?.name)}">${roster.filter((p) => p.teamId === t?.id).map((p) => `<option value="${p.id}">${esc(p.name)} — ${p.positions.join('/') || 'no position'}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <div class="small muted" style="align-self:end;padding-bottom:10px">Only stats that fit the player's position(s) are offered.</div>
      </div>
      <div id="pp-stats"></div>` : `<div class="callout info">${icon('info')}<div>No players on either roster yet. <a href="#/admin/rosters">Import rosters</a> to offer player props.</div></div>`}
      ${propTable(props.filter((p) => p.kind === 'player'), g)}
    </div>

    <div class="card mb">
      <h3 class="row">${icon('chart')} Game stat over/unders</h3>
      <div class="small muted mb">Anything else — e.g. “Total turnovers”, “Longest TD (yards)”, “${esc(h?.name || 'Home')} rushing yards”. You enter the result after the game.</div>
      <div class="row wrap gap-sm mb" id="gp-form"><input name="label" placeholder="What stat?" style="flex:2;min-width:200px"><input class="xs" name="line" placeholder="Line"><input class="xs" name="over" placeholder="-110"><input class="xs" name="under" placeholder="-110"><button class="btn" data-add-gp>${icon('plus')} Add</button></div>
      ${propTable(props.filter((p) => p.kind === 'game'), g)}
    </div>`;

  const refresh = async () => { await loadAll(); renderGameLines(el, gameId); };
  const v = (n) => el.querySelector(`#main-lines input[name="${n}"]`).value.trim().replace(/^\+/, '');
  el.querySelector('[data-lock]')?.addEventListener('click', async () => { await post(`/api/admin/games/${g.id}/lock`, { locked: !g.locked }); refresh(); });
  el.querySelector('[data-ml]').onclick = () => {
    const ml = moneylineFromSpread(Number(v('sp')));
    if (!v('sp') || !ml) return toast('Enter a spread first', 'err');
    el.querySelector('#main-lines input[name=mla]').value = fmtOdds(ml.away); el.querySelector('#main-lines input[name=mlh]').value = fmtOdds(ml.home);
  };
  el.querySelector('[data-suggest-game]')?.addEventListener('click', () => {
    const s = suggestLines(g, powerRatings(g.season));
    if (!s) return toast('Could not suggest lines for this game', 'err');
    const set = (n, v) => { el.querySelector(`#main-lines input[name="${n}"]`).value = v; };
    set('sp', s.spread.home); set('spa', '-110'); set('sph', '-110');
    set('mla', fmtOdds(s.ml.away)); set('mlh', fmtOdds(s.ml.home));
    set('tot', s.total.line); set('ov', '-110'); set('un', '-110');
    set('att', s.awayTotal.line); set('ato', '-110'); set('atu', '-110');
    set('htt', s.homeTotal.line); set('hto', '-110'); set('htu', '-110');
    set('ex', fmtOdds(s.exact.odds));
    toast('Suggested lines filled in. Tweak anything, then click Save game lines.');
  });
  const mlBoxes = ['mla', 'mlh'].map((n) => el.querySelector(`#main-lines input[name="${n}"]`));
  mlBoxes.forEach((b) => { if (b.value) b.dataset.manual = '1'; b.addEventListener('input', () => { b.dataset.manual = '1'; }); });
  el.querySelector('#main-lines input[name="sp"]').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const ml = v !== '' && Number.isFinite(Number(v)) ? moneylineFromSpread(Number(v)) : null;
    mlBoxes.forEach((b, i) => { if (!b.dataset.manual) b.value = ml ? fmtOdds(i ? ml.home : ml.away) : ''; });
  });
  el.querySelector('[data-autoprops-game]')?.addEventListener('click', () => autoPropsModal([g], () => renderGameLines(el, gameId)));
  el.querySelector('[data-exdef]').onclick = () => { el.querySelector('#main-lines input[name=ex]').value = fmtOdds(store.settings.exactScoreOdds || 2500); };
  el.querySelector('[data-save-lines]').onclick = async () => {
    const n = (k) => (v(k) === '' ? null : Number(v(k)));
    const lines = {
      spread: n('sp') != null ? { home: n('sp'), homeOdds: n('sph') ?? -110, awayOdds: n('spa') ?? -110 } : null,
      ml: n('mla') != null || n('mlh') != null ? { away: n('mla'), home: n('mlh') } : null,
      total: n('tot') != null ? { line: n('tot'), over: n('ov') ?? -110, under: n('un') ?? -110 } : null,
      awayTotal: n('att') != null ? { line: n('att'), over: n('ato') ?? -110, under: n('atu') ?? -110 } : null,
      homeTotal: n('htt') != null ? { line: n('htt'), over: n('hto') ?? -110, under: n('htu') ?? -110 } : null,
      exact: n('ex') != null ? { odds: n('ex') } : null,
    };
    try { await post(`/api/admin/games/${g.id}/lines`, { lines }); toast('Lines saved'); refresh(); } catch (e) { toastErr(e); }
  };

  // player prop builder
  const ppSel = el.querySelector('#pp-player');
  ppSel?.addEventListener('change', () => {
    const p = playerById(ppSel.value);
    const box = el.querySelector('#pp-stats');
    if (!p) { box.innerHTML = ''; return; }
    const keys = statsForPositions(p.positions);
    if (!keys.length) { box.innerHTML = `<div class="callout warn mb">${icon('warn')}<div>${esc(p.name)} has no position that supports stat props. Give them a position in Rosters.</div></div>`; return; }
    box.innerHTML = `<div class="table-wrap mb"><table class="t compact"><thead><tr><th>Stat</th><th class="center">Line</th><th class="center">Over</th><th class="center">Under</th></tr></thead><tbody>
      ${keys.map((k) => { const ex = props.find((x) => x.playerId === p.id && x.stat === k && x.status === 'open'); return `<tr><td>${esc(STATS[k].label)}${ex ? ' <span class="badge blue">live</span>' : ''}</td>
        <td class="center"><input class="xs" data-k="${k}" name="line" value="${ex?.line ?? ''}" placeholder="—"></td><td class="center"><input class="xs" data-k="${k}" name="over" value="${ex ? ex.over : ''}" placeholder="-110"></td><td class="center"><input class="xs" data-k="${k}" name="under" value="${ex ? ex.under : ''}" placeholder="-110"></td></tr>`; }).join('')}
      </tbody></table></div><button class="btn primary" data-add-pp>${icon('plus')} Post props for ${esc(p.name)}</button><div class="tiny muted mt">Fill in a line for each stat you want to offer (e.g. 74.5 receiving yards). Blank rows are skipped.</div>`;
    box.querySelector('[data-add-pp]').onclick = async () => {
      const items = [];
      for (const k of keys) {
        const line = box.querySelector(`input[data-k="${k}"][name=line]`).value.trim();
        if (!line) continue;
        const o = box.querySelector(`input[data-k="${k}"][name=over]`).value.trim().replace(/^\+/, '') || '-110';
        const u = box.querySelector(`input[data-k="${k}"][name=under]`).value.trim().replace(/^\+/, '') || '-110';
        if (!isValidOdds(Number(o)) || !isValidOdds(Number(u))) return toast(`Odds for ${STATS[k].label} must look like -110 or +120`, 'err');
        items.push({ gameId: g.id, playerId: p.id, stat: k, line: Number(line), over: Number(o), under: Number(u) });
      }
      if (!items.length) return toast('Enter at least one line', 'err');
      try { const r = await post('/api/admin/props/bulk', { items }); toast(`${r.updated} props posted`); refresh(); } catch (e) { toastErr(e); }
    };
  });

  el.querySelector('[data-add-gp]').onclick = async () => {
    const d = formData(el.querySelector('#gp-form'));
    try { await post('/api/admin/props', { gameId: g.id, kind: 'game', label: d.label, line: d.line, over: (d.over || '-110').replace(/^\+/, ''), under: (d.under || '-110').replace(/^\+/, '') }); toast('Prop added'); refresh(); } catch (e) { toastErr(e); }
  };
  bindPropActions(el, refresh);
}

export function propTable(props, g) {
  if (!props.length) return '';
  return `<div class="table-wrap mt"><table class="t compact"><thead><tr><th>Prop</th><th class="num">Line</th><th class="num">Over</th><th class="num">Under</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>
    ${props.map((p) => {
      const pl = playerById(p.playerId);
      const label = p.kind === 'player' ? `<b>${esc(pl?.name || '?')}</b> <span class="muted">${esc(statLabel(p.stat))}</span>` : `<b>${esc(p.label)}</b>`;
      return `<tr><td>${label}</td><td class="num">${p.line}</td><td class="num">${fmtOdds(p.over)}</td><td class="num">${fmtOdds(p.under)}</td>
        <td>${p.status === 'settled' ? '<span class="badge blue">Settled</span>' : p.status === 'void' ? '<span class="badge">Void</span>' : p.locked ? '<span class="badge gold">Locked</span>' : '<span class="badge green">Open</span>'}</td>
        <td class="nowrap"><input class="xs" data-res="${p.id}" value="${p.result ?? ''}" placeholder="—"> <button class="btn xs" data-setres="${p.id}">Grade</button></td>
        <td class="right nowrap">${p.status === 'open' ? `<button class="btn xs" data-plock="${p.id}" data-v="${p.locked ? 0 : 1}">${icon(p.locked ? 'unlock' : 'lock', 'ico i-sm')}</button>` : ''}
          ${p.status !== 'open' ? `<button class="btn xs" data-reopen="${p.id}" title="Un-grade">↺</button>` : ''}
          <button class="btn xs" data-void="${p.id}" title="Void & refund">Void</button><button class="btn xs danger" data-pdel="${p.id}">${icon('trash', 'ico i-sm')}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export function bindPropActions(el, refresh) {
  el.querySelectorAll('[data-setres]').forEach((b) => (b.onclick = async () => {
    const v = el.querySelector(`[data-res="${b.dataset.setres}"]`).value;
    try { await post(`/api/admin/props/${b.dataset.setres}/result`, { result: v }); toast('Prop graded — bets settled'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-plock]').forEach((b) => (b.onclick = async () => { await post(`/api/admin/props/${b.dataset.plock}/lock`, { locked: b.dataset.v === '1' }); refresh(); }));
  el.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = async () => { await post(`/api/admin/props/${b.dataset.reopen}/result`, { clear: true }); toast('Prop reopened'); refresh(); }));
  el.querySelectorAll('[data-void]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Void prop?', 'All bets on this prop will be refunded.', { okLabel: 'Void' }))) return;
    await post(`/api/admin/props/${b.dataset.void}/result`, { void: true }); toast('Prop voided'); refresh();
  }));
  el.querySelectorAll('[data-pdel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete prop?', 'Bets on this prop are refunded and it is removed.', { danger: true, okLabel: 'Delete' }))) return;
    await del(`/api/admin/props/${b.dataset.pdel}`); toast('Prop deleted'); refresh();
  }));
}
void fmtLine; void fmtStat; void gameLabel;
