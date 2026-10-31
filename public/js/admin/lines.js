import { store, post, del, esc, icon, teamById, playerById, gameById, teamLogo, toast, toastErr, confirmBox, loadAll, emptyState, weekLabel, weekSort, currentWeek, fmtOdds, fmtLine, statLabel, fmtStat, formData, gameLabel } from '../core.js';
import { STATS, statsForPositions, moneylineFromSpread, isValidOdds } from '../shared.js';
import { adminHead } from './admin.js';

let wkSel = null, seasonSel = null;

export async function renderLines(el, args = []) {
  if (args[0]) return renderGameLines(el, args[0]);
  seasonSel = seasonSel || store.settings.currentSeason;
  const games = store.games.filter((g) => String(g.season) === String(seasonSel));
  const weeks = [...new Set(games.map((g) => String(g.week)))].sort(weekSort);
  if (!wkSel || !weeks.includes(wkSel)) wkSel = currentWeek(seasonSel);
  const list = games.filter((g) => String(g.week) === String(wkSel));

  el.innerHTML = `
    ${adminHead('Odds & Lines', 'Set the spread, moneyline and total for a whole week at once. Odds are American (e.g. -110, +150). Leave blank to keep a market off the board.')}
    ${!games.length ? emptyState('No games yet', 'Import or add games first.', 'calendar', '<div class="mt"><a class="btn primary" href="#/admin/schedule">Go to Schedule</a></div>') : `
    <div class="row wrap mb">
      <select id="wk" style="width:auto">${weeks.map((w) => `<option value="${esc(w)}" ${w === wkSel ? 'selected' : ''}>${esc(weekLabel(w))}</option>`).join('')}</select>
      <button class="btn sm" data-automl>${icon('wand')} Fill moneylines from spreads</button>
      <button class="btn sm" data-default>${icon('wand')} Fill blank juice with -110</button>
      <span class="grow"></span>
      <button class="btn primary" data-save>${icon('check')} Save all lines</button>
    </div>
    <div class="table-wrap"><table class="t compact lines-table"><thead><tr>
      <th>Game</th><th class="center">Home spread</th><th class="center">Away odds</th><th class="center">Home odds</th>
      <th class="center">ML away</th><th class="center">ML home</th><th class="center">Total</th><th class="center">Over</th><th class="center">Under</th><th></th></tr></thead><tbody>
      ${list.map((g) => {
        const L = g.lines || {};
        const a = teamById(g.awayId), h = teamById(g.homeId);
        const dis = g.status !== 'scheduled' ? 'disabled' : '';
        const inp = (name, v, ph = '') => `<input class="xs" data-g="${g.id}" name="${name}" value="${v ?? ''}" placeholder="${ph}" ${dis}>`;
        return `<tr class="line-row">
          <td><div class="row" style="gap:6px">${teamLogo(a, 'sm')}<span class="small"><b>${esc(a?.abbr || a?.name)}</b> @ <b>${esc(h?.abbr || h?.name)}</b></span>${teamLogo(h, 'sm')}${g.locked && g.status === 'scheduled' ? '<span class="badge gold">Locked</span>' : g.status === 'final' ? '<span class="badge">Final</span>' : ''}</div></td>
          <td class="center">${inp('sp', L.spread?.home, '-3.5')}</td><td class="center">${inp('spa', L.spread?.awayOdds, '-110')}</td><td class="center">${inp('sph', L.spread?.homeOdds, '-110')}</td>
          <td class="center">${inp('mla', L.ml?.away, '+130')}</td><td class="center">${inp('mlh', L.ml?.home, '-150')}</td>
          <td class="center">${inp('tot', L.total?.line, '48.5')}</td><td class="center">${inp('ov', L.total?.over, '-110')}</td><td class="center">${inp('un', L.total?.under, '-110')}</td>
          <td class="right"><a class="btn xs" href="#/admin/lines/${g.id}">More ${icon('chevron', 'ico i-sm')}</a></td></tr>`;
      }).join('')}
    </tbody></table></div>
    <div class="small muted mt">“More” opens team totals, exact score, player props and custom stat over/unders for that game. Spread is from the <b>home</b> team's view (home -3.5 means the home team is favored by 3.5).</div>`}`;

  el.querySelector('#wk')?.addEventListener('change', (e) => { wkSel = e.target.value; renderLines(el); });
  const val = (gid, n) => el.querySelector(`input[data-g="${gid}"][name="${n}"]`)?.value.trim();
  const setv = (gid, n, v) => { const i = el.querySelector(`input[data-g="${gid}"][name="${n}"]`); if (i && !i.disabled) i.value = v; };
  el.querySelector('[data-automl]')?.addEventListener('click', () => {
    let n = 0;
    for (const g of list) {
      const sp = val(g.id, 'sp');
      if (sp === '' || sp == null) continue;
      const ml = moneylineFromSpread(Number(sp));
      if (!ml) continue;
      setv(g.id, 'mlh', ml.home > 0 ? '+' + ml.home : ml.home); setv(g.id, 'mla', ml.away > 0 ? '+' + ml.away : ml.away); n++;
    }
    toast(n ? `Suggested moneylines for ${n} games — review, then save` : 'Enter some spreads first', n ? 'ok' : 'err');
  });
  el.querySelector('[data-default]')?.addEventListener('click', () => {
    for (const g of list) {
      if (val(g.id, 'sp')) { if (!val(g.id, 'spa')) setv(g.id, 'spa', '-110'); if (!val(g.id, 'sph')) setv(g.id, 'sph', '-110'); }
      if (val(g.id, 'tot')) { if (!val(g.id, 'ov')) setv(g.id, 'ov', '-110'); if (!val(g.id, 'un')) setv(g.id, 'un', '-110'); }
    }
  });
  el.querySelector('[data-save]')?.addEventListener('click', async (e) => {
    const items = [];
    for (const g of list) {
      if (g.status !== 'scheduled') continue;
      const L = { ...(g.lines || {}) };
      const n = (k) => { const v = val(g.id, k); return v === '' ? null : Number(v.replace('+', '')); };
      L.spread = n('sp') != null ? { home: n('sp'), homeOdds: n('sph') ?? -110, awayOdds: n('spa') ?? -110 } : null;
      L.ml = n('mla') != null || n('mlh') != null ? { away: n('mla'), home: n('mlh') } : null;
      L.total = n('tot') != null ? { line: n('tot'), over: n('ov') ?? -110, under: n('un') ?? -110 } : null;
      items.push({ gameId: g.id, lines: L });
    }
    e.target.disabled = true;
    try { const r = await post('/api/admin/lines/bulk', { items }); toast(`Lines saved for ${r.updated} games`); await loadAll(); renderLines(el); }
    catch (ex) { toastErr(ex); e.target.disabled = false; }
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
      <h3>Game lines</h3>
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
      <h3 class="row">${icon('user')} Player props</h3>
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
