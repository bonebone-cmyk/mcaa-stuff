import { store, post, del, esc, icon, teamById, teamLogo, modal, formData, toast, toastErr, confirmBox, loadAll, emptyState, weekLabel, weekSort, fmtDate, groupBy, sortGames } from '../core.js';
import { adminHead } from './admin.js';
import { mountImporter, anotherVersionCallout } from './importer.js';
import { parseSchedule } from './parsers.js';

let viewSeason = null;

const teamOptions = (sel = '') => [...store.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

export async function renderSchedule(el) {
  viewSeason = viewSeason || store.settings.currentSeason;
  const seasons = [...new Set([store.settings.currentSeason, ...store.games.map((g) => String(g.season)), viewSeason])].sort().reverse();
  const games = store.games.filter((g) => String(g.season) === String(viewSeason));
  const byWeek = groupBy(games, (g) => String(g.week));
  const weeks = [...byWeek.keys()].sort(weekSort);

  el.innerHTML = `
    ${adminHead('Schedule & Games', 'Import a whole season from a screenshot, spreadsheet or text — or add games one by one.',
      `<button class="btn primary" data-add>${icon('plus')} Add game</button>`)}
    <div class="card mb">
      <h3 class="row">${icon('calendar')} Import a schedule</h3>
      <div class="grid grid-3 mb">
        <label class="f"><span class="lbl">Season</span><input id="imp-season" value="${esc(viewSeason)}"></label>
        <label class="f"><span class="lbl">Week (if the text doesn't say)</span><input id="imp-week" value="1"></label>
        <label class="f"><span class="lbl">"A vs B" means</span><select id="imp-vs"><option value="home">A is home</option><option value="away">A is away</option></select></label>
      </div>
      <div id="imp"></div>
      <div id="imp-prev" class="mt"></div>
    </div>

    <div class="row between mb"><div class="section-title" style="margin:0;flex:1">Season ${esc(viewSeason)} · ${games.length} games</div>
      ${seasons.length > 1 ? `<select id="season-view" style="width:auto;margin-left:12px">${seasons.map((s) => `<option ${s === String(viewSeason) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}</div>
    ${weeks.length ? weeks.map((w) => `
      <div class="card pad0 mb">
        <div class="card-head"><h3>${esc(weekLabel(w))} <span class="muted small">· ${byWeek.get(w).length} games</span></h3>
          <div class="row"><button class="btn xs" data-lockweek="${esc(w)}" data-lock="1">${icon('lock', 'ico i-sm')} Lock all</button><button class="btn xs" data-lockweek="${esc(w)}" data-lock="0">${icon('unlock', 'ico i-sm')} Unlock all</button></div></div>
        <div class="table-wrap" style="border:0;border-radius:0"><table class="t compact"><tbody>
        ${byWeek.get(w).sort(sortGames).map((g) => {
          const h = teamById(g.homeId), a = teamById(g.awayId);
          return `<tr>
            <td style="width:34px"><button class="btn icon sm ${g.gotw ? 'gold' : 'ghost'}" title="Game of the Week" data-gotw="${g.id}" data-on="${g.gotw ? 0 : 1}">${icon('star')}</button></td>
            <td><div class="row">${teamLogo(a, 'sm')}<b>${esc(a?.name)}</b> <span class="muted">${g.neutral ? 'vs' : '@'}</span> ${teamLogo(h, 'sm')}<b>${esc(h?.name)}</b></div></td>
            <td class="muted small nowrap">${[g.date ? fmtDate(g.date) : '', esc(g.time || ''), esc(g.location || '')].filter(Boolean).join(' · ') || '—'}</td>
            <td>${g.status === 'final' ? `<span class="badge">Final ${g.awayScore}-${g.homeScore}</span>` : g.status === 'cancelled' ? '<span class="badge red">Cancelled</span>' : g.locked ? '<span class="badge gold">Locked</span>' : '<span class="badge green">Open</span>'}</td>
            <td class="right nowrap">
              ${g.status === 'scheduled' ? `<button class="btn xs" data-lockg="${g.id}" data-lock="${g.locked ? 0 : 1}">${icon(g.locked ? 'unlock' : 'lock', 'ico i-sm')} ${g.locked ? 'Unlock' : 'Lock'}</button>` : ''}
              <a class="btn xs" href="#/admin/lines/${g.id}">${icon('scale', 'ico i-sm')} Lines</a>
              <button class="btn xs" data-edit="${g.id}">${icon('edit', 'ico i-sm')}</button>
              <button class="btn xs danger" data-del="${g.id}">${icon('trash', 'ico i-sm')}</button></td></tr>`;
        }).join('')}</tbody></table></div></div>`).join('')
      : emptyState('No games this season', store.teams.length ? 'Import your schedule above or add games one at a time.' : 'Add teams first, then import your schedule.', 'calendar')}`;

  const refresh = async () => { await loadAll(); renderSchedule(el); };
  el.querySelector('#season-view')?.addEventListener('change', (e) => { viewSeason = e.target.value; renderSchedule(el); });
  el.querySelector('[data-add]').onclick = () => gameModal(null, refresh);
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => gameModal(store.games.find((g) => g.id === b.dataset.edit), refresh)));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete game?', 'Delete this game? Any open bets on it are refunded.', { danger: true, okLabel: 'Delete' }))) return;
    try { await del('/api/admin/games/' + b.dataset.del); toast('Game deleted'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-gotw]').forEach((b) => (b.onclick = async () => {
    try { await post(`/api/admin/games/${b.dataset.gotw}/gotw`, { on: b.dataset.on === '1' }); toast(b.dataset.on === '1' ? 'Set as Game of the Week ★' : 'Removed Game of the Week'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-lockg]').forEach((b) => (b.onclick = async () => {
    try { await post(`/api/admin/games/${b.dataset.lockg}/lock`, { locked: b.dataset.lock === '1' }); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-lockweek]').forEach((b) => (b.onclick = async () => {
    try { const r = await post('/api/admin/games/lock-week', { season: viewSeason, week: b.dataset.lockweek, locked: b.dataset.lock === '1' }); toast(`${r.updated} games ${b.dataset.lock === '1' ? 'locked' : 'unlocked'}`); refresh(); } catch (e) { toastErr(e); }
  }));

  // ---- importer
  const prev = el.querySelector('#imp-prev');
  let lastText = '', lastMeta = {};
  const doPreview = (text, meta = lastMeta) => {
    lastText = text; lastMeta = meta;
    if (!text.trim()) { prev.innerHTML = ''; return; }
    const season = el.querySelector('#imp-season').value.trim() || store.settings.currentSeason;
    const res = parseSchedule(text, { season, defaultWeek: el.querySelector('#imp-week').value.trim() || '1', vsHomeFirst: el.querySelector('#imp-vs').value === 'home' });
    renderPreview(prev, res, season, meta, refresh);
  };
  mountImporter(el.querySelector('#imp'), {
    placeholder: 'Drop a schedule screenshot, upload a CSV, or paste text…\n\nWeek 1\nCreeper State @ Enderman Tech 7:00 PM\nNether U vs Redstone A&M',
    sample: `Loose text:\n  Week 1 - Sat, Sept 6\n  Creeper State @ Enderman Tech - 7:00 PM - Block Stadium\n  Nether U vs Redstone A&M 3:30 PM\n  Week 2\n  Enderman Tech at Nether U\n\nOne line per game:\n  Week 3: Creeper State @ Redstone A&M 8pm\n\nSpreadsheet / CSV:\n  Week,Date,Time,Away,Home,Location\n  1,9/6,7:00 PM,Creeper State,Enderman Tech,Block Stadium`,
    onPreview: doPreview,
  });
  ['#imp-season', '#imp-week', '#imp-vs'].forEach((s) => el.querySelector(s).addEventListener('change', () => lastText && doPreview(lastText)));
}

function renderPreview(prev, res, season, meta, refresh) {
  const games = res.games.map((g) => ({ ...g, include: true }));
  const unknown = res.unknownTeams;
  const mapping = {}; // unknown name -> teamId | '__new'
  for (const n of unknown) mapping[n] = '__new';
  const lowOcr = meta?.source === 'image' && meta.confidence != null && meta.confidence < 60 && !meta.edited;
  const shaky = !games.length || res.quality < 0.6 || res.garbage.length > 0 || lowOcr;

  const draw = () => {
    const resolved = (g, side) => g[side]?.id || (mapping[g[side + 'Name']] && mapping[g[side + 'Name']] !== '__new' ? mapping[g[side + 'Name']] : null);
    prev.innerHTML = `
      ${shaky ? anotherVersionCallout(!games.length ? 'I couldn\'t find any games in it.' : lowOcr ? `The image was hard to read (clarity ${meta.confidence}%).` : res.garbage.length ? `Some team names look garbled (${res.garbage.slice(0, 3).map(esc).join(', ')}).` : `Only ${Math.round(res.quality * 100)}% of the lines made sense as games.`) + '<div class="mt"></div>' : ''}
      ${games.length ? `
      <div class="row wrap mb"><span class="badge green">${games.length} games found</span><span class="badge">${new Set(games.map((g) => g.week)).size} weeks</span>${res.unparsed.length ? `<span class="badge gold">${res.unparsed.length} lines not understood</span>` : ''}${games.some((g) => g.homeScore != null) ? '<span class="badge blue">Includes scores — will be saved as finals</span>' : ''}</div>
      ${unknown.length ? `<div class="card flat tight mb"><div class="bold mb" style="margin-bottom:8px">${icon('warn', 'ico i-md')} ${unknown.length} team name${unknown.length === 1 ? '' : 's'} not in the league yet</div>
        <div class="col gap-sm">${unknown.map((n) => `<div class="row"><span class="grow"><b>${esc(n)}</b></span><select class="sm" style="width:auto" data-map="${esc(n)}">
          <option value="__new" ${mapping[n] === '__new' ? 'selected' : ''}>➕ Create new team "${esc(n)}"</option><option value="__skip" ${mapping[n] === '__skip' ? 'selected' : ''}>Skip games with this team</option>
          <optgroup label="It's actually…">${teamOptions(mapping[n])}</optgroup></select></div>`).join('')}</div></div>` : ''}
      <div class="table-wrap import-preview"><table class="t compact"><thead><tr><th></th><th>Week</th><th>Away</th><th></th><th>Home</th><th>Date</th><th>Time</th><th>Location</th>${games.some((g) => g.homeScore != null) ? '<th>Score</th>' : ''}</tr></thead><tbody>
        ${games.map((g, i) => {
          const nm = (side) => { const id = resolved(g, side); const t = id && teamById(id); return t ? `${esc(t.name)}${g[side + 'Fuzzy'] ? ` <span class="tiny muted">(“${esc(g[side + 'Name'])}”)</span>` : ''}` : mapping[g[side + 'Name']] === '__skip' ? `<s class="muted">${esc(g[side + 'Name'])}</s>` : `<span class="gold">${esc(g[side + 'Name'])} (new)</span>`; };
          return `<tr style="${g.include ? '' : 'opacity:.4'}"><td><input type="checkbox" data-inc="${i}" ${g.include ? 'checked' : ''}></td><td>${esc(g.week)}</td><td>${nm('away')}</td>
            <td><button class="btn xs ghost" data-swap="${i}" title="Swap home/away">⇄</button></td><td>${nm('home')}</td><td class="nowrap">${g.date ? fmtDate(g.date) : '—'}</td><td class="nowrap">${esc(g.time || '—')}</td><td>${esc(g.location || '—')}</td>
            ${games.some((x) => x.homeScore != null) ? `<td class="num">${g.homeScore != null ? `${g.awayScore}-${g.homeScore}` : ''}</td>` : ''}</tr>`;
        }).join('')}
      </tbody></table></div>
      ${res.unparsed.length ? `<details class="mt small" ${shaky ? 'open' : ''}><summary class="muted" style="cursor:pointer">Lines I didn't understand (${res.unparsed.length})</summary><pre class="sample">${esc(res.unparsed.join('\n'))}</pre></details>` : ''}
      <div class="row mt"><button class="btn primary" data-save>${icon('check')} Add ${games.filter((g) => g.include).length} games to ${esc(season)}</button>
        <span class="small muted">Tip: fix typos in the text box and press Preview again.</span></div>` : ''}`;

    prev.querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => { mapping[s.dataset.map] = s.value; draw(); }));
    prev.querySelectorAll('[data-inc]').forEach((c) => c.addEventListener('change', () => { games[+c.dataset.inc].include = c.checked; draw(); }));
    prev.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => {
      const g = games[+b.dataset.swap];
      [g.home, g.away] = [g.away, g.home]; [g.homeName, g.awayName] = [g.awayName, g.homeName];
      [g.homeScore, g.awayScore] = [g.awayScore, g.homeScore]; [g.homeFuzzy, g.awayFuzzy] = [g.awayFuzzy, g.homeFuzzy];
      draw();
    }));
    prev.querySelector('[data-save]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        // create new teams first
        const toCreate = unknown.filter((n) => mapping[n] === '__new');
        if (toCreate.length) {
          const r = await post('/api/admin/teams/bulk', { teams: toCreate.map((name) => ({ name })) });
          r.teams.forEach((t, i) => { mapping[toCreate[i]] = t.id; });
        }
        const rows = [];
        for (const g of games) {
          if (!g.include) continue;
          const homeId = g.home?.id || mapping[g.homeName], awayId = g.away?.id || mapping[g.awayName];
          if (!homeId || !awayId || homeId === '__skip' || awayId === '__skip' || homeId === awayId) continue;
          rows.push({ season, week: g.week, date: g.date, time: g.time, location: g.location, broadcast: g.broadcast, neutral: g.neutral, homeId, awayId, homeScore: g.homeScore, awayScore: g.awayScore });
        }
        const r = await post('/api/admin/games/bulk', { games: rows });
        toast(`${r.created} games added to ${season}${toCreate.length ? ` · ${toCreate.length} new teams` : ''}`);
        viewSeason = season;
        refresh();
      } catch (ex) { toastErr(ex); e.target.disabled = false; }
    });
  };
  draw();
}

function gameModal(g, done) {
  if (store.teams.length < 2) return toast('Add at least two teams first', 'err');
  modal({
    title: g ? 'Edit game' : 'Add game',
    body: `<div class="col" style="gap:14px">
      <div class="grid grid-2"><label class="f"><span class="lbl">Season</span><input name="season" value="${esc(g?.season || viewSeason || store.settings.currentSeason)}"></label>
        <label class="f"><span class="lbl">Week</span><input name="week" value="${esc(g?.week || '1')}" placeholder="1, 2… or Championship"></label></div>
      <div class="grid grid-2"><label class="f"><span class="lbl">Away team</span><select name="awayId">${teamOptions(g?.awayId)}</select></label>
        <label class="f"><span class="lbl">Home team</span><select name="homeId">${teamOptions(g?.homeId || [...store.teams].sort((a, b) => a.name.localeCompare(b.name))[1]?.id)}</select></label></div>
      <div class="grid grid-2"><label class="f"><span class="lbl">Date (for show)</span><input type="date" name="date" value="${esc(g?.date || '')}"></label>
        <label class="f"><span class="lbl">Time (for show)</span><input name="time" value="${esc(g?.time || '')}" placeholder="7:00 PM"></label></div>
      <div class="grid grid-2"><label class="f"><span class="lbl">Location</span><input name="location" value="${esc(g?.location || '')}" placeholder="Stadium / city"></label>
        <label class="f"><span class="lbl">Broadcast</span><input name="broadcast" value="${esc(g?.broadcast || '')}" placeholder="e.g. MCAA Network"></label></div>
      <label class="f"><span class="lbl">Note</span><input name="note" value="${esc(g?.note || '')}" placeholder="e.g. Rivalry game"></label>
      <label class="check"><input type="checkbox" name="neutral" ${g?.neutral ? 'checked' : ''}> Neutral site</label>
      <div class="tiny muted">All games are simmed at once — dates and times are just for flavor.</div>
    </div>`,
    actions: [{ label: 'Cancel' }, {
      label: g ? 'Save' : 'Add game', cls: 'btn primary', onClick: async (close, root) => {
        await post('/api/admin/games', { ...formData(root), id: g?.id });
        toast(g ? 'Game saved' : 'Game added');
        done();
      },
    }],
  });
}
