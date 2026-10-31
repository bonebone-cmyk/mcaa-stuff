import { store, api, post, esc, icon, toast, toastErr, confirmBox, formData, loadAll, download, fmtOdds, setToken } from '../core.js';
import { adminHead } from './admin.js';

export async function renderSettings(el) {
  const s = store.settings;
  el.innerHTML = `
    ${adminHead('Settings & Backup', 'League-wide options.')}
    <div class="card mb" id="sform">
      <h3>League settings</h3>
      <div class="grid grid-3">
        <label class="f"><span class="lbl">Current season</span><input name="currentSeason" value="${esc(s.currentSeason)}"></label>
        <label class="f"><span class="lbl">Current week (blank = automatic)</span><input name="currentWeek" value="${esc(s.currentWeek || '')}" placeholder="auto"></label>
        <label class="f"><span class="lbl">Starting coins for new users</span><input type="number" name="startingBalance" value="${s.startingBalance}"></label>
        <label class="f"><span class="lbl">Minimum bet</span><input type="number" name="minBet" value="${s.minBet || 1}"></label>
        <label class="f"><span class="lbl">Maximum bet (0 = no limit)</span><input type="number" name="maxBet" value="${s.maxBet || 0}"></label>
        <label class="f"><span class="lbl">Default exact-score odds</span><input name="exactScoreOdds" value="${fmtOdds(s.exactScoreOdds || 2500)}"></label>
      </div>
      <label class="f mt"><span class="lbl">Announcement banner (shown to everyone)</span><input name="announcement" value="${esc(s.announcement || '')}" placeholder="e.g. Week 4 lines are up — betting locks Saturday at 6!" maxlength="200"></label>
      <button class="btn primary mt" data-save>${icon('check')} Save settings</button>
    </div>
    <div class="card">
      <h3 class="row">${icon('db')} Backup & restore</h3>
      <div class="small muted mb">Download everything (users, bets, teams, logos, stats) as one file. Do this regularly — especially before moving the site to a new host.</div>
      <div class="row wrap"><button class="btn" data-backup>${icon('upload')} Download backup</button>
        <label class="btn danger">${icon('refresh')} Restore from backup<input type="file" accept=".json,application/json" hidden id="restore"></label></div>
    </div>`;
  el.querySelector('[data-save]').onclick = async () => {
    const d = formData(el.querySelector('#sform'));
    d.exactScoreOdds = String(d.exactScoreOdds).replace(/^\+/, '');
    try { await post('/api/admin/settings', d); toast('Settings saved'); await loadAll(); renderSettings(el); } catch (e) { toastErr(e); }
  };
  el.querySelector('[data-backup]').onclick = async () => {
    try { const data = await api('/api/admin/backup'); download(`mcaa-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data)); toast('Backup downloaded'); } catch (e) { toastErr(e); }
  };
  el.querySelector('#restore').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!(await confirmBox('Restore backup?', 'This <b>replaces everything</b> on the site with the backup file. Everyone (including you) may need to log in again.', { danger: true, okLabel: 'Restore' }))) return;
    try {
      const data = JSON.parse(await f.text());
      const r = await post('/api/admin/restore', data);
      if (r.token) setToken(r.token); else setToken(null);
      toast('Backup restored');
      setTimeout(() => location.reload(), 600);
    } catch (ex) { toastErr(ex); }
  });
}
