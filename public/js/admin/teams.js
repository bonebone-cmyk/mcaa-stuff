import { store, post, del, esc, icon, teamLogo, modal, formData, toast, toastErr, confirmBox, imageToDataUrl, loadAll, emptyState } from '../core.js';
import { adminHead } from './admin.js';
import { mountImporter } from './importer.js';
import { parseTeams, matchTeam } from './parsers.js';

export async function renderTeams(el) {
  const teams = [...store.teams].sort((a, b) => (a.conference || '').localeCompare(b.conference || '') || a.name.localeCompare(b.name));
  el.innerHTML = `
    ${adminHead('Teams & Logos', 'Add every school in the league, then drop in their logos.',
      `<button class="btn" data-bulk>${icon('list')} Bulk add</button><button class="btn" data-logos>${icon('image')} Bulk logos</button><button class="btn primary" data-add>${icon('plus')} Add team</button>`)}
    ${teams.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Logo</th><th>Team</th><th>Abbr</th><th>Mascot</th><th>Conference</th><th>Colors</th><th>Players</th><th></th></tr></thead><tbody>
      ${teams.map((t) => `<tr>
        <td><label style="cursor:pointer" title="Click to upload a logo">${teamLogo(t)}<input type="file" accept="image/*" hidden data-logo="${t.id}"></label></td>
        <td><a href="#/team/${t.id}"><b>${esc(t.name)}</b></a></td><td class="pixel small">${esc(t.abbr || '')}</td><td>${esc(t.mascot || '')}</td><td>${esc(t.conference || '')}</td>
        <td><span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:${esc(t.color)};vertical-align:middle"></span> <span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:${esc(t.color2)};vertical-align:middle"></span></td>
        <td class="num">${store.players.filter((p) => p.teamId === t.id).length}</td>
        <td class="right nowrap"><button class="btn sm" data-edit="${t.id}">${icon('edit')} Edit</button> <button class="btn sm danger" data-del="${t.id}">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>` : emptyState('No teams yet', 'Add teams one at a time, or paste/upload your whole league list with Bulk add.', 'shield',
      `<div class="row mt" style="justify-content:center"><button class="btn primary" data-add2>${icon('plus')} Add team</button><button class="btn" data-bulk2>${icon('list')} Bulk add</button></div>`)}`;

  const refresh = async () => { await loadAll(); renderTeams(el); };
  [el.querySelector('[data-add]'), el.querySelector('[data-add2]')].forEach((b) => b && (b.onclick = () => teamModal(null, refresh)));
  [el.querySelector('[data-bulk]'), el.querySelector('[data-bulk2]')].forEach((b) => b && (b.onclick = () => bulkTeams(refresh)));
  el.querySelector('[data-logos]').onclick = () => bulkLogos(refresh);
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => teamModal(store.teams.find((t) => t.id === b.dataset.edit), refresh)));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const t = store.teams.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox('Delete team?', `Delete <b>${esc(t.name)}</b> and its roster? This can't be undone.`, { danger: true, okLabel: 'Delete' }))) return;
    try { await del('/api/admin/teams/' + t.id); toast('Team deleted'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-logo]').forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try { await post(`/api/admin/teams/${inp.dataset.logo}/logo`, { dataUrl: await imageToDataUrl(f) }); toast('Logo updated'); refresh(); } catch (e) { toastErr(e); }
  }));
}

function teamModal(t, done) {
  let logoData = null;
  modal({
    title: t ? `Edit ${esc(t.name)}` : 'Add team',
    body: `<div class="col" style="gap:14px">
      <div class="row"><div id="logo-prev">${teamLogo(t || { name: '?', color: '#3ee08f', color2: '#0f172a' }, 'lg')}</div>
        <div class="col" style="gap:6px"><label class="btn sm">${icon('upload')} Upload logo<input type="file" accept="image/*" hidden id="logo-in"></label>
        ${t?.logo ? '<button class="btn sm ghost" id="logo-rm">Remove logo</button>' : ''}<div class="tiny muted">PNG with transparent background looks best.</div></div></div>
      <label class="f"><span class="lbl">School / team name *</span><input name="name" value="${esc(t?.name || '')}" placeholder="e.g. Creeper State"></label>
      <div class="grid grid-2"><label class="f"><span class="lbl">Abbreviation</span><input name="abbr" maxlength="6" value="${esc(t?.abbr || '')}" placeholder="CSU"></label>
        <label class="f"><span class="lbl">Mascot</span><input name="mascot" value="${esc(t?.mascot || '')}" placeholder="Creepers"></label></div>
      <label class="f"><span class="lbl">Conference</span><input name="conference" list="conf-list" value="${esc(t?.conference || '')}" placeholder="Optional">
        <datalist id="conf-list">${[...new Set(store.teams.map((x) => x.conference).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <div class="row"><label class="f"><span class="lbl">Primary color</span><input type="color" name="color" value="${esc(t?.color || '#3ee08f')}"></label>
        <label class="f"><span class="lbl">Secondary color</span><input type="color" name="color2" value="${esc(t?.color2 || '#0f172a')}"></label></div>
    </div>`,
    actions: [{ label: 'Cancel' }, {
      label: t ? 'Save' : 'Add team', cls: 'btn primary', onClick: async (close, root) => {
        const d = formData(root);
        const r = await post('/api/admin/teams', { ...d, id: t?.id });
        if (logoData) await post(`/api/admin/teams/${r.team.id}/logo`, { dataUrl: logoData });
        toast(t ? 'Team saved' : `${r.team.name} added`);
        done();
      },
    }],
    onMount(root) {
      root.querySelector('#logo-in').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        logoData = await imageToDataUrl(f);
        root.querySelector('#logo-prev').innerHTML = `<div class="tlogo img lg"><img src="${logoData}"></div>`;
      });
      root.querySelector('#logo-rm')?.addEventListener('click', async () => {
        await del(`/api/admin/teams/${t.id}/logo`); toast('Logo removed'); done();
        root.remove();
      });
    },
  });
}

function bulkTeams(done) {
  let parsed = [];
  modal({
    title: 'Bulk add teams',
    wide: true,
    body: `<div class="small muted mb">One team per line, or a spreadsheet/CSV with columns like <span class="kbd">Name, Abbr, Mascot, Conference, Color</span>. Existing teams with the same name are updated, not duplicated.</div>
      <div id="imp"></div><div id="prev" class="mt"></div>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Add teams', cls: 'btn primary', onClick: async () => {
        if (!parsed.length) { toast('Nothing to import yet — preview first', 'err'); return false; }
        const r = await post('/api/admin/teams/bulk', { teams: parsed });
        toast(`${r.teams.length} teams saved`);
        done();
      },
    }],
    onMount(root) {
      mountImporter(root.querySelector('#imp'), {
        placeholder: 'Creeper State\nEnderman Tech\nNether University\n\n— or —\n\nName,Abbr,Mascot,Conference,Color\nCreeper State,CSU,Creepers,Overworld,#22c55e',
        sample: 'Conference: Overworld\nCreeper State\nRedstone A&M\n\nConference: The End\nEnder Tech\n\nName\tAbbr\tMascot\tConference\tColor\nCreeper State\tCSU\tCreepers\tOverworld\t#22c55e',
        onPreview(text) {
          parsed = parseTeams(text);
          root.querySelector('#prev').innerHTML = parsed.length ? `<div class="table-wrap import-preview"><table class="t compact"><thead><tr><th>Name</th><th>Abbr</th><th>Mascot</th><th>Conference</th><th>Status</th></tr></thead><tbody>
            ${parsed.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.abbr)}</td><td>${esc(t.mascot)}</td><td>${esc(t.conference)}</td><td>${matchTeam(t.name)?.score === 1 ? '<span class="badge blue">Update</span>' : '<span class="badge green">New</span>'}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="callout warn">No teams found in that text.</div>';
        },
      });
    },
  });
}

function bulkLogos(done) {
  let items = [];
  modal({
    title: 'Bulk upload logos',
    wide: true,
    body: `<div class="small muted mb">Select many logo images at once. Name each file after its team (e.g. <span class="kbd">creeper-state.png</span> or <span class="kbd">CSU.png</span>) and they'll be matched automatically — you can fix any match below.</div>
      <label class="drop">${icon('image')}<div class="bold" style="color:var(--text)">Choose logo images</div><input type="file" accept="image/*" multiple hidden id="lg"></label>
      <div id="lg-list" class="mt"></div>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Upload logos', cls: 'btn primary', onClick: async (close, root) => {
        const sel = [...root.querySelectorAll('select[data-i]')];
        let n = 0;
        for (const s of sel) {
          if (!s.value) continue;
          await post(`/api/admin/teams/${s.value}/logo`, { dataUrl: items[+s.dataset.i].data });
          n++;
        }
        toast(`${n} logos uploaded`);
        done();
      },
    }],
    onMount(root) {
      root.querySelector('#lg').addEventListener('change', async (e) => {
        items = [];
        for (const f of e.target.files) {
          const base = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\blogo\b/i, '').trim();
          items.push({ name: f.name, data: await imageToDataUrl(f), team: matchTeam(base)?.team || null });
        }
        const opts = [...store.teams].sort((a, b) => a.name.localeCompare(b.name));
        root.querySelector('#lg-list').innerHTML = `<div class="table-wrap"><table class="t compact"><tbody>${items.map((it, i) => `<tr>
          <td><div class="tlogo img"><img src="${it.data}"></div></td><td class="small">${esc(it.name)}</td>
          <td><select class="sm" data-i="${i}"><option value="">— skip —</option>${opts.map((t) => `<option value="${t.id}" ${it.team?.id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
      });
    },
  });
}
