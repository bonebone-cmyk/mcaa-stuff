import { store, post, del, esc, icon, teamById, teamLogo, modal, formData, toast, toastErr, confirmBox, loadAll, emptyState } from '../core.js';
import { POSITION_LIST, CLASSES } from '../shared.js';
import { adminHead } from './admin.js';
import { mountImporter } from './importer.js';
import { parseRoster, matchTeam } from './parsers.js';

let selTeam = '';

export async function renderRosters(el, args = []) {
  if (args[0] && teamById(args[0])) selTeam = args[0];
  if (selTeam && !teamById(selTeam)) selTeam = '';
  if (!store.teams.length) {
    el.innerHTML = adminHead('Rosters', '') + emptyState('Add teams first', 'Rosters belong to teams — add your league teams, then come back to import players.', 'shield', `<div class="mt"><a class="btn primary" href="#/admin/teams">Go to Teams</a></div>`);
    return;
  }
  const teams = [...store.teams].sort((a, b) => a.name.localeCompare(b.name));
  const roster = store.players.filter((p) => !selTeam || p.teamId === selTeam)
    .sort((a, b) => (selTeam ? 0 : (teamById(a.teamId)?.name || '').localeCompare(teamById(b.teamId)?.name || '')) || POSITION_LIST.indexOf(a.positions[0]) - POSITION_LIST.indexOf(b.positions[0]) || a.name.localeCompare(b.name));

  el.innerHTML = `
    ${adminHead('Rosters', 'Every player needs a name, position(s) and class. Jersey numbers are optional.',
      `<button class="btn primary" data-add>${icon('plus')} Add player</button>`)}
    <div class="card mb">
      <h3 class="row">${icon('upload')} Import a roster</h3>
      <div class="grid grid-2 mb">
        <label class="f"><span class="lbl">Import into</span><select id="imp-team"><option value="">Use Team column / team headings in the text</option>${teams.map((t) => `<option value="${t.id}" ${selTeam === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="imp-replace"> Replace this team's roster (removes players not in the import)</label>
      </div>
      <div id="imp"></div>
      <div id="imp-prev" class="mt"></div>
    </div>
    <div class="row between mb"><div class="row"><select id="team-sel" style="width:auto"><option value="">All teams (${store.players.length})</option>${teams.map((t) => `<option value="${t.id}" ${selTeam === t.id ? 'selected' : ''}>${esc(t.name)} (${store.players.filter((p) => p.teamId === t.id).length})</option>`).join('')}</select></div>
      <span class="small muted">${roster.length} players</span></div>
    ${roster.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Name</th>${selTeam ? '' : '<th>Team</th>'}<th>Positions</th><th>Class</th><th></th></tr></thead><tbody>
      ${roster.slice(0, 600).map((p) => `<tr><td class="jersey">${p.number ?? '—'}</td><td><a href="#/player/${p.id}"><b>${esc(p.name)}</b></a></td>
        ${selTeam ? '' : `<td><div class="row">${teamLogo(teamById(p.teamId), 'sm')}${esc(teamById(p.teamId)?.name || '')}</div></td>`}
        <td>${p.positions.map((x) => `<span class="pos">${esc(x)}</span>`).join(' ') || '<span class="badge red">None</span>'}</td><td>${esc(p.cls || '—')}</td>
        <td class="right nowrap"><button class="btn xs" data-edit="${p.id}">${icon('edit')} Edit</button> <button class="btn xs danger" data-del="${p.id}">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>` : emptyState('No players yet', 'Import a roster above, or add players one at a time.', 'users')}`;

  const refresh = async () => { await loadAll(); renderRosters(el); };
  el.querySelector('#team-sel').onchange = (e) => { selTeam = e.target.value; renderRosters(el); };
  el.querySelector('[data-add]').onclick = () => editPlayerModal({ teamId: selTeam || teams[0].id, positions: [] }, refresh);
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editPlayerModal(store.players.find((p) => p.id === b.dataset.edit), refresh)));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const p = store.players.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox('Remove player?', `Remove <b>${esc(p.name)}</b>? Open props on this player will be voided and refunded.`, { danger: true, okLabel: 'Remove' }))) return;
    try { await del('/api/admin/players/' + p.id); toast('Player removed'); refresh(); } catch (e) { toastErr(e); }
  }));

  // ---- importer
  let parsed = null;
  const prev = el.querySelector('#imp-prev');
  const impTeam = el.querySelector('#imp-team');
  const doPreview = (text) => {
    if (!text.trim()) { prev.innerHTML = ''; parsed = null; return; }
    parsed = parseRoster(text, { teamId: impTeam.value || null });
    const rows = parsed.players;
    const missingTeam = rows.filter((r) => !r.teamId);
    const noPos = rows.filter((r) => !r.positions.length);
    const existing = (r) => store.players.some((p) => p.teamId === r.teamId && p.name.toLowerCase().replace(/\W/g, '') === r.name.toLowerCase().replace(/\W/g, ''));
    prev.innerHTML = rows.length ? `
      <div class="row wrap mb"><span class="badge green">${rows.length} players</span>
        ${parsed.duplicatesMerged ? `<span class="badge blue">${parsed.duplicatesMerged} duplicate listing${parsed.duplicatesMerged === 1 ? '' : 's'} merged (same player, multiple positions)</span>` : ''}
        ${missingTeam.length ? `<span class="badge red">${missingTeam.length} without a team</span>` : ''}
        ${noPos.length ? `<span class="badge gold">${noPos.length} without a position</span>` : ''}
        ${parsed.unparsed.length ? `<span class="badge">${parsed.unparsed.length} lines skipped</span>` : ''}</div>
      ${missingTeam.length ? `<div class="callout warn mb">${icon('warn')}<div>Some players don't have a team. Pick a team in "Import into", add a <span class="kbd">Team</span> column, or put the team name on its own line above its players.</div></div>` : ''}
      <div class="table-wrap import-preview"><table class="t compact"><thead><tr><th>#</th><th>Name</th><th>Team</th><th>Positions</th><th>Class</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="jersey">${esc(r.number ?? '—')}</td><td><b>${esc(r.name)}</b></td><td>${r.teamId ? esc(teamById(r.teamId).name) : `<span class="red">${esc(r.teamName || 'No team')}</span>`}</td>
          <td>${r.positions.map((x) => `<span class="pos">${esc(x)}</span>`).join(' ') || '<span class="gold">—</span>'}${r.mergedCount ? ` <span class="badge blue" title="Listed ${r.mergedCount} times — merged">merged</span>` : ''}</td>
          <td>${esc(r.cls || '—')}</td><td>${r.teamId && existing(r) ? '<span class="badge blue">Update</span>' : '<span class="badge green">New</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      ${parsed.unparsed.length ? `<details class="mt small"><summary class="muted" style="cursor:pointer">Skipped lines (${parsed.unparsed.length})</summary><pre class="sample">${esc(parsed.unparsed.join('\n'))}</pre></details>` : ''}
      <div class="row mt"><button class="btn primary" data-save ${rows.some((r) => r.teamId) ? '' : 'disabled'}>${icon('check')} Import ${rows.filter((r) => r.teamId).length} players</button></div>`
      : `<div class="callout warn">${icon('warn')}<div>I couldn't find any players in that. Try one player per line like <span class="kbd">12 John Smith QB SR</span>, or a spreadsheet with Name / Pos / Class / # columns. If this came from an image, please upload a clearer version.</div></div>`;
    prev.querySelector('[data-save]')?.addEventListener('click', async () => {
      const list = rows.filter((r) => r.teamId).map((r) => ({ name: r.name, positions: r.positions, cls: r.cls, number: r.number, teamId: r.teamId }));
      const replace = el.querySelector('#imp-replace').checked && impTeam.value;
      if (replace && !(await confirmBox('Replace roster?', `Players on <b>${esc(teamById(impTeam.value).name)}</b> who aren't in this import will be removed.`, { danger: true, okLabel: 'Replace' }))) return;
      try {
        const r = await post('/api/admin/players/bulk', { players: list, replaceTeamId: replace ? impTeam.value : undefined });
        toast(`${r.created} added, ${r.updated} updated`);
        if (impTeam.value) selTeam = impTeam.value;
        refresh();
      } catch (e) { toastErr(e); }
    });
  };
  const imp = mountImporter(el.querySelector('#imp'), {
    placeholder: 'Paste a roster, drop a screenshot, or upload a CSV…\n\n1 Steve Stone QB SR\n7 Alex Ender WR/KR FR\n55 Herobrine DL JR',
    sample: `Loose text (one player per line — number optional):\n  12 Steve Stone QB SR\n  Alex Ender WR SO\n  Alex Ender KR SO        <- same player twice = merged into WR/KR\n  #55 Herobrine DE/LB Jr.\n\nSeveral teams at once (team name on its own line):\n  Creeper State\n  1 Steve Stone QB SR\n  Enderman Tech\n  4 Pearl Jumper RB FR\n\nSpreadsheet / CSV (columns in any order):\n  Name,Pos,Class,#,Team\n  Steve Stone,QB,SR,12,Creeper State`,
    onPreview: doPreview,
  });
  impTeam.onchange = () => doPreview(imp.text);
  void matchTeam;
}

export function editPlayerModal(p, done) {
  const isNew = !p.id;
  const teams = [...store.teams].sort((a, b) => a.name.localeCompare(b.name));
  const sel = new Set(p.positions || []);
  modal({
    title: isNew ? 'Add player' : `Edit ${esc(p.name)}`,
    body: `<div class="col" style="gap:14px">
      <label class="f"><span class="lbl">Name *</span><input name="name" value="${esc(p.name || '')}" placeholder="Player name"></label>
      <div class="grid grid-2">
        <label class="f"><span class="lbl">Team *</span><select name="teamId">${teams.map((t) => `<option value="${t.id}" ${p.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="f"><span class="lbl">Jersey # (optional)</span><input name="number" value="${esc(p.number ?? '')}" maxlength="3" placeholder="—"></label>
      </div>
      <label class="f"><span class="lbl">Class *</span><select name="cls"><option value="">—</option>${CLASSES.map((c) => `<option ${p.cls === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div class="f"><span class="lbl small muted bold" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px">Positions * (pick one or more)</span>
        <div class="row wrap gap-sm mt" style="margin-top:8px" id="pos-chips">${POSITION_LIST.map((x) => `<button type="button" class="chip ${sel.has(x) ? 'on' : ''}" data-pos="${x}">${x}</button>`).join('')}</div>
        <div class="tiny muted mt">Props offered depend on position — e.g. WRs get receiving props, QBs get passing props.</div></div>
    </div>`,
    actions: [{ label: 'Cancel' }, {
      label: isNew ? 'Add player' : 'Save', cls: 'btn primary', onClick: async (close, root) => {
        const d = formData(root);
        if (!sel.size) { toast('Pick at least one position', 'err'); return false; }
        await post('/api/admin/players', { ...d, positions: [...sel], id: p.id });
        toast(isNew ? 'Player added' : 'Player saved');
        await loadAll();
        done();
      },
    }],
    onMount(root) {
      root.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => {
        const x = b.dataset.pos;
        sel.has(x) ? sel.delete(x) : sel.add(x);
        b.classList.toggle('on', sel.has(x));
      }));
    },
  });
}
