import { store, post, del, esc, icon, teamById, teamLogo, modal, toast, toastErr, confirmBox, loadAll, emptyState, fmtOdds } from '../core.js';
import { isValidOdds } from '../shared.js';
import { adminHead } from './admin.js';
import { sortSpecials } from '../views/specials.js';

let draft = null;

const blank = (mode = 'yesno') => ({
  question: '', mode, category: '', note: '', teamId: '', featured: false,
  options: mode === 'yesno' ? [{ label: 'Yes', odds: '-110' }, { label: 'No', odds: '-110' }] : [{ label: '', odds: '' }, { label: '', odds: '' }],
});

const CATEGORY_IDEAS = ['Postseason', 'Regular Season', 'Conference', 'Rivalry', 'Records', 'Player Milestones', 'Coaching'];

export async function renderSpecials(el) {
  const season = store.settings.currentSeason;
  const list = sortSpecials(store.specials);
  const categories = [...new Set([...store.specials.map((s) => s.category).filter(Boolean), ...CATEGORY_IDEAS])];
  const teams = [...store.teams].sort((a, b) => a.name.localeCompare(b.name));

  el.innerHTML = `
    ${adminHead('Specials', 'Make a bet on anything: yes/no questions or multiple-choice answers, each with its own odds.',
      draft ? '' : `<button class="btn primary" data-new>${icon('plus')} New special</button>`)}
    <div id="form"></div>
    <div class="section-title">All specials · ${list.length}</div>
    ${list.length ? `<div class="col" style="gap:10px">${list.map((sp) => {
      const t = teamById(sp.teamId);
      return `<div class="card tight"><div class="row between wrap">
        <div class="row" style="min-width:0;flex:1">${t ? teamLogo(t, 'sm') : ''}<div style="min-width:0"><div class="bold">${esc(sp.question)}</div>
          <div class="tiny muted">${[sp.season, sp.category, sp.note].filter(Boolean).map(esc).join(' · ')}</div>
          <div class="small mt" style="margin-top:6px">${sp.options.map((o) => `<span class="chip ${sp.winnerId === o.id ? 'on' : ''}" style="margin:0 4px 4px 0">${sp.winnerId === o.id ? '🏆 ' : ''}${esc(o.label)} <b class="num">${fmtOdds(o.odds)}</b></span>`).join('')}</div></div></div>
        <div class="row wrap">
          ${sp.featured ? '<span class="badge purple">Featured</span>' : ''}
          ${sp.status === 'settled' ? '<span class="badge gold">Settled</span>' : sp.locked ? '<span class="badge gold">Locked</span>' : '<span class="badge green">Open</span>'}
          ${sp.status !== 'settled' ? `<button class="btn xs" data-edit="${sp.id}">${icon('edit', 'ico i-sm')} Edit</button>
            <button class="btn xs" data-lock="${sp.id}" data-v="${sp.locked ? 0 : 1}">${icon(sp.locked ? 'unlock' : 'lock', 'ico i-sm')} ${sp.locked ? 'Unlock' : 'Lock'}</button>
            <button class="btn xs gold" data-settle="${sp.id}">🏆 Result</button>`
            : `<button class="btn xs" data-reopen="${sp.id}">Undo result</button>`}
          <button class="btn xs danger" data-del="${sp.id}" title="Delete & refund">${icon('trash', 'ico i-sm')}</button>
        </div></div></div>`;
    }).join('')}</div>`
      : emptyState('No specials yet', 'Click “New special” to make one, like “Will Fresno be the #1 seed?” or “Who wins the conference?”', 'star')}`;

  const refresh = async () => { await loadAll(); renderSpecials(el); };
  el.querySelector('[data-new]')?.addEventListener('click', () => { draft = blank('yesno'); renderSpecials(el); });
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const sp = store.specials.find((x) => x.id === b.dataset.edit);
    const isYesNo = sp.options.length === 2 && sp.options.every((o) => /^(yes|no)$/i.test(o.label));
    const isTeams = !isYesNo && sp.options.every((o) => o.teamId);
    draft = { id: sp.id, question: sp.question, mode: isYesNo ? 'yesno' : isTeams ? 'teams' : 'custom', category: sp.category || '', note: sp.note || '', teamId: sp.teamId || '', featured: !!sp.featured, locked: sp.locked, season: sp.season,
      options: sp.options.map((o) => ({ id: o.id, label: o.label, odds: fmtOdds(o.odds), teamId: o.teamId || null, playerId: o.playerId || null })) };
    renderSpecials(el);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  el.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = async () => {
    try { await post(`/api/admin/specials/${b.dataset.lock}/lock`, { locked: b.dataset.v === '1' }); toast(b.dataset.v === '1' ? 'Betting locked' : 'Betting reopened'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-settle]').forEach((b) => (b.onclick = () => {
    const sp = store.specials.find((x) => x.id === b.dataset.settle);
    modal({
      title: 'What happened?',
      body: `<div class="bold mb">${esc(sp.question)}</div><div class="col gap-sm">${sp.options.map((o, i) => `<label class="check card flat tight" style="cursor:pointer"><input type="radio" name="win" value="${o.id}" ${i === 0 ? 'checked' : ''}> ${esc(o.label)} <span class="muted num">(${fmtOdds(o.odds)})</span></label>`).join('')}</div>
        <div class="small muted mt">Bets on the winning answer get paid. Everything else loses. You can undo this later if you make a mistake.</div>`,
      actions: [{ label: 'Cancel' }, { label: '🏆 Settle bets', cls: 'btn gold', onClick: async (c, root) => {
        await post(`/api/admin/specials/${sp.id}/settle`, { optionId: root.querySelector('input[name=win]:checked').value });
        toast('Settled. Winners have been paid.'); refresh();
      } }],
    });
  }));
  el.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Undo result?', 'Payouts for this bet are taken back and it goes back to locked, so you can settle it again.', { okLabel: 'Undo result' }))) return;
    try { await post(`/api/admin/specials/${b.dataset.reopen}/reopen`); toast('Result undone'); refresh(); } catch (e) { toastErr(e); }
  }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete this special?', 'It disappears and every bet on it is refunded.', { danger: true, okLabel: 'Delete & refund' }))) return;
    try { await del(`/api/admin/specials/${b.dataset.del}`); toast('Deleted, bets refunded'); refresh(); } catch (e) { toastErr(e); }
  }));

  if (draft) renderForm(el.querySelector('#form'), { categories, teams, season, refresh, close: () => { draft = null; renderSpecials(el); } });
}

function renderForm(box, ctx) {
  const d = draft;
  const draw = () => renderForm(box, ctx);
  box.innerHTML = `<div class="card mb" style="border-color:rgba(167,139,250,.45)">
    <h3 class="row">${icon('star')} ${d.id ? 'Edit special' : 'New special'}</h3>
    <div class="col" style="gap:14px">
      <label class="f"><span class="lbl">Question *</span><input id="q" value="${esc(d.question)}" maxlength="160" placeholder="e.g. Will Fresno be the #1 seed?"></label>
      <div class="f"><span class="lbl small muted bold" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px">Answers</span>
        <div class="seg mt" style="margin-top:8px">${[['yesno', 'Yes / No'], ['teams', 'Pick a team'], ['custom', 'Custom answers']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${d.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="col gap-sm">
        <div class="opt-row tiny muted bold"><span>ANSWER</span><span class="center">ODDS</span><span></span></div>
        ${d.options.map((o, i) => `<div class="opt-row">
          <div class="row" style="gap:6px">${o.teamId ? teamLogo(teamById(o.teamId), 'sm') : ''}<input data-label="${i}" value="${esc(o.label)}" placeholder="${d.mode === 'yesno' ? (i ? 'No' : 'Yes') : `Answer ${i + 1}`}"></div>
          <input class="xs" style="width:auto" data-odds="${i}" value="${esc(o.odds ?? '')}" placeholder="-110">
          <button class="btn icon ghost" data-rm="${i}" title="Remove" ${d.options.length <= 2 ? 'disabled' : ''}>${icon('x')}</button></div>`).join('')}
        <div class="row wrap">
          ${d.mode === 'teams' ? `<select id="add-team" style="width:auto"><option value="">+ Add a team…</option>${ctx.teams.filter((t) => !d.options.some((o) => o.teamId === t.id)).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
            <button class="btn sm" data-allteams>Add every team</button>` : ''}
          ${d.mode !== 'yesno' ? `<button class="btn sm" data-addopt>${icon('plus', 'ico i-sm')} Add answer</button>` : ''}
          <span class="tiny muted">Odds are American: -150 = favorite, +250 = underdog.</span>
        </div>
      </div>
      <div class="grid grid-3">
        <label class="f"><span class="lbl">Category</span><input id="cat" list="cat-list" value="${esc(d.category)}" placeholder="e.g. Postseason"><datalist id="cat-list">${ctx.categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="f"><span class="lbl">Team logo to show (optional)</span><select id="team"><option value="">None</option>${ctx.teams.map((t) => `<option value="${t.id}" ${d.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="f"><span class="lbl">Note (optional)</span><input id="note" value="${esc(d.note)}" maxlength="140" placeholder="e.g. Settles after Week 12"></label>
      </div>
      <label class="check"><input type="checkbox" id="featured" ${d.featured ? 'checked' : ''}> Feature it (shows first, and on the Sportsbook home page)</label>
      <div class="row"><button class="btn primary" data-save>${icon('check')} ${d.id ? 'Save changes' : 'Post it'}</button><button class="btn ghost" data-cancel>Cancel</button>
        ${d.id ? '<span class="tiny muted">If you remove an answer, bets on it are refunded.</span>' : ''}</div>
    </div></div>`;

  const sync = () => {
    d.question = box.querySelector('#q').value;
    d.category = box.querySelector('#cat').value;
    d.note = box.querySelector('#note').value;
    d.teamId = box.querySelector('#team').value;
    d.featured = box.querySelector('#featured').checked;
    box.querySelectorAll('[data-label]').forEach((i) => { d.options[+i.dataset.label].label = i.value; });
    box.querySelectorAll('[data-odds]').forEach((i) => { d.options[+i.dataset.odds].odds = i.value; });
  };
  box.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    sync();
    if (b.dataset.mode === d.mode) return;
    d.mode = b.dataset.mode;
    if (d.mode === 'yesno') d.options = [{ label: 'Yes', odds: '-110' }, { label: 'No', odds: '-110' }];
    else if (d.mode === 'teams') d.options = d.options.filter((o) => o.teamId);
    else d.options = d.options.filter((o) => o.label && !/^(yes|no)$/i.test(o.label));
    while (d.options.length < 2 && d.mode !== 'teams') d.options.push({ label: '', odds: '' });
    draw();
  }));
  box.querySelector('[data-addopt]')?.addEventListener('click', () => { sync(); d.options.push({ label: '', odds: '' }); draw(); });
  box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { sync(); d.options.splice(+b.dataset.rm, 1); draw(); }));
  box.querySelector('#add-team')?.addEventListener('change', (e) => {
    sync();
    const t = teamById(e.target.value);
    if (t) d.options.push({ label: t.name, odds: '+500', teamId: t.id });
    draw();
  });
  box.querySelector('[data-allteams]')?.addEventListener('click', () => {
    sync();
    for (const t of ctx.teams) if (!d.options.some((o) => o.teamId === t.id)) d.options.push({ label: t.name, odds: '+1000', teamId: t.id });
    d.options = d.options.filter((o) => o.label || o.teamId);
    draw();
  });
  box.querySelector('[data-cancel]').onclick = ctx.close;
  box.querySelector('[data-save]').onclick = async (e) => {
    sync();
    const opts = d.options.filter((o) => o.label.trim());
    if (!d.question.trim()) return toast('Type the question first', 'err');
    if (opts.length < 2) return toast('Give at least two answers', 'err');
    const badOdds = opts.find((o) => !isValidOdds(Number(String(o.odds).trim().replace(/^\+/, ''))));
    if (badOdds) return toast(`Odds for "${badOdds.label}" should look like -110 or +250`, 'err');
    e.target.disabled = true;
    try {
      await post('/api/admin/specials', {
        id: d.id, question: d.question, category: d.category, note: d.note, teamId: d.teamId || null, featured: d.featured, locked: d.locked, season: d.season || ctx.season,
        options: opts.map((o) => ({ id: o.id, label: o.label.trim(), odds: Number(String(o.odds).trim().replace(/^\+/, '')), teamId: o.teamId, playerId: o.playerId })),
      });
      toast(d.id ? 'Special updated' : 'Special posted. Everyone can bet on it now.');
      draft = null;
      ctx.refresh();
    } catch (ex) { toastErr(ex); e.target.disabled = false; }
  };
  if (!d.id && !d.question) setTimeout(() => box.querySelector('#q')?.focus(), 30);
}
