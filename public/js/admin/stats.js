import { store, post, api, esc, icon, teamById, playerById, gameById, toast, toastErr, confirmBox, loadAll, weekLabel, weekSort, gameLabel, fmtStat } from '../core.js';
import { STATS, STAT_CATEGORIES } from '../shared.js';
import { adminHead } from './admin.js';
import { mountImporter, anotherVersionCallout } from './importer.js';
import { parseStats, parseTeamStats } from './parsers.js';

const st = { mode: 'game', gameId: '', category: '', teamId: '', season: null };

export async function renderStats(el, args = []) {
  if (args[0] && gameById(args[0])) { st.mode = 'game'; st.gameId = args[0]; }
  st.season = st.season || store.settings.currentSeason;
  const games = [...store.games].filter((g) => g.status !== 'cancelled').sort((a, b) => String(b.season).localeCompare(String(a.season)) || weekSort(b.week, a.week));
  if (st.mode === 'game' && !st.gameId) st.gameId = games.find((g) => g.status === 'final')?.id || games[0]?.id || '';
  const g = gameById(st.gameId);
  const teamsInScope = st.mode === 'game' && g ? [teamById(g.awayId), teamById(g.homeId)].filter(Boolean) : [...store.teams].sort((a, b) => a.name.localeCompare(b.name));

  el.innerHTML = `
    ${adminHead('Import Stats', 'Paste a box score or stat sheet, upload a CSV, or drop a screenshot. Game box scores grade player props automatically.')}
    <div class="card mb">
      <div class="seg mb">${[['game', 'Game box score'], ['season', 'Season player stats'], ['team', 'Team season stats']].map(([k, l]) => `<button data-mode="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="grid grid-3 mb">
        ${st.mode === 'game' ? `<label class="f" style="grid-column:span 2"><span class="lbl">Game</span><select id="st-game">${games.map((x) => `<option value="${x.id}" ${x.id === st.gameId ? 'selected' : ''}>${esc(x.season)} ${esc(weekLabel(x.week))} — ${esc(gameLabel(x))}${x.status === 'final' ? ` (${x.awayScore}-${x.homeScore})` : ''}</option>`).join('')}</select></label>`
          : `<label class="f"><span class="lbl">Season</span><input id="st-season" value="${esc(st.season)}"></label>`}
        ${st.mode !== 'team' ? `<label class="f"><span class="lbl">Stat table type</span><select id="st-cat"><option value="">Auto-detect from headers</option>${STAT_CATEGORIES.map(([k, l]) => `<option value="${k}" ${st.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
        ${st.mode !== 'team' ? `<label class="f"><span class="lbl">Team (helps match names)</span><select id="st-team"><option value="">${st.mode === 'game' ? 'Either team' : 'Any team'}</option>${teamsInScope.map((t) => `<option value="${t.id}" ${st.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="small muted mb">${st.mode === 'team' ? 'First column = team name; every other column is saved as a team stat with that header (e.g. <span class="kbd">Team, Total Yards, Turnovers</span>).'
        : 'First row must be headers. Use a <span class="kbd">Name</span> column (and optionally <span class="kbd">Team</span>). Pick a table type if headers are generic like <span class="kbd">YDS</span> / <span class="kbd">TD</span>.'}</div>
      <div id="imp"></div>
      <div id="prev" class="mt"></div>
    </div>
    <div id="existing"></div>`;

  el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; st.teamId = ''; renderStats(el); }));
  el.querySelector('#st-game')?.addEventListener('change', (e) => { st.gameId = e.target.value; st.teamId = ''; location.hash = '#/admin/stats/' + st.gameId; });
  el.querySelector('#st-season')?.addEventListener('change', (e) => { st.season = e.target.value.trim(); });
  el.querySelector('#st-cat')?.addEventListener('change', (e) => { st.category = e.target.value; if (last) preview(last, lastMeta); });
  el.querySelector('#st-team')?.addEventListener('change', (e) => { st.teamId = e.target.value; if (last) preview(last, lastMeta); });

  const prev = el.querySelector('#prev');
  let last = '', lastMeta = {};
  const refresh = async () => { await loadAll(); renderStats(el, st.mode === 'game' ? [st.gameId] : []); };

  function preview(text, meta = {}) {
    last = text; lastMeta = meta;
    if (!text.trim()) { prev.innerHTML = ''; return; }
    const shakyOcr = meta.source === 'image' && meta.confidence < 60 && !meta.edited;
    if (st.mode === 'team') {
      const r = parseTeamStats(text);
      prev.innerHTML = r.rows.length ? `${shakyOcr ? anotherVersionCallout('The image was hard to read.') : ''}
        <div class="table-wrap import-preview mt"><table class="t compact"><thead><tr><th>Team</th>${r.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${x.team ? `<b>${esc(x.team.name)}</b>` : `<span class="red">${esc(x.name)} (no match)</span>`}</td>${r.headers.map((h) => `<td>${esc(x.stats[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <button class="btn primary mt" data-save>${icon('check')} Save stats for ${r.rows.filter((x) => x.team).length} teams</button>`
        : anotherVersionCallout('I couldn\'t find a header row plus team rows.');
      prev.querySelector('[data-save]')?.addEventListener('click', async () => {
        try { const res = await post('/api/admin/stats/team-season', { season: st.season, rows: r.rows.filter((x) => x.team).map((x) => ({ teamId: x.team.id, stats: x.stats })) }); toast(`Saved stats for ${res.updated} teams`); refresh(); } catch (e) { toastErr(e); }
      });
      return;
    }
    let scopeTeam = st.teamId || null;
    const r = parseStats(text, { category: st.category, teamId: scopeTeam });
    // in game mode, restrict matches to the two teams
    if (st.mode === 'game' && g) for (const row of r.rows) if (row.player && ![g.homeId, g.awayId].includes(row.player.teamId)) { row.player = null; row.reason = 'Not on either team'; }
    const matched = r.rows.filter((x) => x.player);
    const cols = [...new Set(r.columns.map((c) => c.key))];
    const pool = store.players.filter((p) => (st.mode === 'game' && g ? [g.homeId, g.awayId].includes(p.teamId) : true)).sort((a, b) => a.name.localeCompare(b.name));
    const bad = !r.rows.length || !cols.length || (r.rows.length && matched.length / r.rows.length < 0.5) || shakyOcr;
    prev.innerHTML = `
      ${bad ? anotherVersionCallout(!cols.length ? 'I couldn\'t recognize any stat columns in the header row.' : !r.rows.length ? 'I couldn\'t find any player rows.' : shakyOcr ? 'The image was hard to read.' : 'Most player names didn\'t match anyone on the rosters.') : ''}
      ${r.rows.length && cols.length ? `
      <div class="row wrap mb mt"><span class="badge green">${matched.length} matched</span>${r.rows.length - matched.length ? `<span class="badge red">${r.rows.length - matched.length} unmatched</span>` : ''}
        <span class="badge">Columns: ${cols.map((k) => esc(STATS[k].short)).join(', ')}</span>${r.ignored.length ? `<span class="badge gold" title="${esc(r.ignored.join(', '))}">Ignored: ${esc(r.ignored.slice(0, 6).join(', '))}${r.ignored.length > 6 ? '…' : ''}</span>` : ''}</div>
      <div class="table-wrap import-preview"><table class="t compact"><thead><tr><th>Name in sheet</th><th>Player</th>${cols.map((k) => `<th class="num" title="${esc(STATS[k].label)}">${esc(STATS[k].short)}</th>`).join('')}</tr></thead><tbody>
        ${r.rows.map((x, i) => `<tr><td>${esc(x.name)}${x.teamName ? ` <span class="tiny muted">${esc(x.teamName)}</span>` : ''}</td>
          <td><select class="sm" data-row="${i}" style="min-width:180px"><option value="">— skip (${esc(x.reason || 'no match')}) —</option>${pool.map((p) => `<option value="${p.id}" ${x.player?.id === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(teamById(p.teamId)?.abbr || '')} ${esc(p.positions.join('/'))}</option>`).join('')}</select>${x.fuzzy ? ' <span class="badge gold" title="Close match — double-check">~</span>' : ''}</td>
          ${cols.map((k) => `<td class="num">${fmtStat(k, x.stats[k])}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="row mt"><button class="btn primary" data-save>${icon('check')} Save ${st.mode === 'game' ? 'box score' : 'season stats'}</button>
        ${st.mode === 'game' ? '<label class="check"><input type="checkbox" id="grade" checked> Grade player props for this game</label>' : '<span class="small muted">Season stats are added to/override totals built from box scores.</span>'}</div>` : ''}`;

    prev.querySelectorAll('select[data-row]').forEach((s) => s.addEventListener('change', () => { r.rows[+s.dataset.row].player = playerById(s.value) || null; }));
    prev.querySelector('[data-save]')?.addEventListener('click', async (e) => {
      const rows = r.rows.filter((x) => x.player).map((x) => ({ playerId: x.player.id, stats: x.stats }));
      if (!rows.length) return toast('No matched players to save', 'err');
      e.target.disabled = true;
      try {
        if (st.mode === 'game') {
          const res = await post('/api/admin/stats/player-game', { gameId: st.gameId, rows, gradeProps: prev.querySelector('#grade').checked });
          toast(`Saved ${res.updated} players${res.graded ? ` · graded ${res.graded} props` : ''}`);
        } else {
          const res = await post('/api/admin/stats/player-season', { season: st.season, rows });
          toast(`Saved season stats for ${res.updated} players`);
        }
        refresh();
      } catch (ex) { toastErr(ex); e.target.disabled = false; }
    });
  }

  mountImporter(el.querySelector('#imp'), {
    placeholder: st.mode === 'team' ? 'Team, Points/G, Total Yards, Turnovers\nCreeper State, 31.2, 4120, 9' : 'Name, Team, CMP, ATT, PASS YDS, PASS TD, INT\nSteve Stone, Creeper State, 22, 31, 288, 3, 1',
    sample: st.mode === 'team' ? 'Team\tPoints For\tYards/Game\tTurnovers\nCreeper State\t312\t401.5\t9'
      : `With explicit headers (any order):\n  Name,Team,Pass Yds,Pass TD,Rush Yds,Rec,Rec Yds,Tackles,Sacks\n\nA single stat table (choose its type above, e.g. "Receiving"):\n  Player\tREC\tYDS\tTD\n  Alex Ender\t7\t112\t1\n\nRecognized: CMP, ATT, YDS, TD, INT, CAR, REC, TGT, TKL, TFL, SACK, PD, FF, FR, FGM, FGA, XPM, XPA, PUNTS, IN20, KR YDS, PR YDS, Pancakes, Sacks Allowed…`,
    onPreview: preview,
  });

  // existing box score for this game
  if (st.mode === 'game' && g) {
    try {
      const box = await api(`/api/games/${g.id}/box`);
      const ids = Object.keys(box.players || {});
      if (ids.length) {
        el.querySelector('#existing').innerHTML = `<div class="card"><div class="row between"><h3 style="margin:0">Saved box score · ${ids.length} players</h3><button class="btn sm danger" data-clear>${icon('trash')} Clear box score</button></div>
          <div class="small muted mt">${ids.map((id) => esc(playerById(id)?.name || '?')).join(', ')}</div>
          <div class="small muted mt">Re-importing merges new numbers into existing rows.</div></div>`;
        el.querySelector('[data-clear]').onclick = async () => {
          if (!(await confirmBox('Clear box score?', 'Removes saved stats for this game. Already-graded props stay graded.', { danger: true, okLabel: 'Clear' }))) return;
          await post('/api/admin/stats/clear', { scope: 'game', gameId: g.id }); toast('Box score cleared'); refresh();
        };
      }
    } catch {}
  }
}
