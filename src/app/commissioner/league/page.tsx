import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, DemoBadge, TeamLogo } from '@/components/ui';
import { getTeams, PHASE_LABEL } from '@/lib/queries';
import { createSeasonAction, deleteConferenceAction, deleteRivalryAction, generateScheduleAction, saveConferenceAction, saveNetworkAction, saveRivalryAction } from '../actions';

export default async function LeaguePage() {
  const sql = getSql();
  const [seasons, confs, networks, rivalries, teams] = await Promise.all([
    sql`select s.*, (select count(*)::int from games g where g.season_id = s.id) as games from seasons s order by year desc`,
    sql`select c.*, (select count(*)::int from teams t where t.conference_id = c.id and t.active) as n from conferences c order by name`,
    sql`select * from tv_networks order by tier, name`,
    sql`select r.*, a.school as a, b.school as b from rivalries r join teams a on a.id = r.team_a_id join teams b on b.id = r.team_b_id order by r.name`,
    getTeams(),
  ]);
  const nextYear = (seasons.find((s) => !s.isDemo)?.year ?? new Date().getFullYear() - 1) + 1;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Seasons" pad={false}>
          <table className="table">
            <thead><tr><th>Season</th><th>Phase</th><th>Games</th><th></th></tr></thead>
            <tbody>{seasons.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name} <DemoBadge show={s.isDemo} /></td><td><Badge>{PHASE_LABEL[s.phase]}</Badge></td><td className="tabular">{s.games}</td>
                <td>{s.phase !== 'archived' && (
                  <ActionForm action={generateScheduleAction} confirm={s.games ? 'Regenerate the regular-season schedule? Only possible if no games were played.' : 'Generate the schedule?'} className="flex items-center gap-2">
                    <input type="hidden" name="seasonId" value={s.id} />{s.games > 0 && <input type="hidden" name="replace" value="on" />}
                    <Submit className="btn-ghost btn-sm">{s.games ? 'Regenerate' : 'Generate'} schedule</Submit>
                  </ActionForm>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Create Official Season">
          <ActionForm action={createSeasonAction} className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Year</span><input name="year" type="number" required defaultValue={nextYear} className="input" /></label>
            <label><span className="label">Name</span><input name="name" placeholder={`${nextYear} Season`} className="input" /></label>
            <label><span className="label">Regular-season weeks</span><input name="weeks" type="number" defaultValue={13} min={4} max={16} className="input" /></label>
            <label><span className="label">Playoff size</span><select name="playoffSize" defaultValue="12" className="input">{[4, 8, 12, 16].map((n) => <option key={n} value={n}>{n} teams</option>)}</select></label>
            <label><span className="label">Automatic bids</span><input name="autoBids" type="number" defaultValue={5} min={0} max={16} className="input" /></label>
            <label><span className="label">Recruit class size</span><input name="classSize" type="number" defaultValue={2000} className="input" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="schedule" defaultChecked /> Generate schedule</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recruits" defaultChecked /> Generate recruiting class</label>
            <div className="sm:col-span-2"><Submit>Create season</Submit><p className="mt-1 text-xs text-muted">The new season becomes the current season. Teams’ current conferences are snapshotted for it.</p></div>
          </ActionForm>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Conferences">
          <ul className="mb-4 space-y-2">{confs.map((c) => (
            <li key={c.id}>
              <details>
                <summary className="flex cursor-pointer items-center gap-2 text-sm"><TeamLogo team={{ logoUrl: c.logoUrl, abbreviation: c.shortName }} size={20} /><span className="font-semibold">{c.name}</span><span className="text-muted">· {c.n} teams · {c.conferenceGames} conf games</span></summary>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <ActionForm action={saveConferenceAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="name" defaultValue={c.name} className="input max-w-[14rem]" aria-label="Name" />
                    <input name="shortName" defaultValue={c.shortName} className="input max-w-[8rem]" aria-label="Short name" />
                    <input name="conferenceGames" type="number" defaultValue={c.conferenceGames} className="input max-w-[5rem]" aria-label="Conference games" />
                    <input name="logoUrl" defaultValue={c.logoUrl ?? ''} placeholder="Logo URL" className="input max-w-[14rem]" />
                    <Submit className="btn-ghost btn-sm">Save</Submit>
                  </ActionForm>
                  {c.n === 0 && <ActionForm action={deleteConferenceAction} confirm="Delete this conference?"><input type="hidden" name="id" value={c.id} /><Submit className="btn-danger btn-sm">Delete</Submit></ActionForm>}
                </div>
              </details>
            </li>
          ))}</ul>
          <ActionForm action={saveConferenceAction} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <input name="name" required placeholder="New conference name" className="input max-w-[14rem]" />
            <input name="shortName" placeholder="Short name" className="input max-w-[8rem]" />
            <input name="conferenceGames" type="number" defaultValue={8} className="input max-w-[5rem]" aria-label="Conference games" />
            <Submit className="btn-primary btn-sm">Add conference</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Move teams between conferences from each team’s edit page. Realignment applies to the next season created (current season membership is preserved for history).</p>
        </Card>
        <div className="space-y-6">
          <Card title="TV Networks">
            <ul className="mb-3 space-y-2">{networks.map((n) => (
              <li key={n.id}><ActionForm action={saveNetworkAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={n.id} />
                <input name="name" defaultValue={n.name} className="input max-w-[14rem]" aria-label="Name" />
                <input name="shortName" defaultValue={n.shortName} className="input max-w-[6rem]" aria-label="Short" />
                <input name="tier" type="number" min={1} max={4} defaultValue={n.tier} className="input max-w-[4rem]" aria-label="Tier" />
                <input name="logoUrl" defaultValue={n.logoUrl ?? ''} placeholder="Logo URL" className="input max-w-[12rem]" />
                <Submit className="btn-ghost btn-sm">Save</Submit>
              </ActionForm></li>
            ))}</ul>
            <ActionForm action={saveNetworkAction} resetOnSuccess className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <input name="name" required placeholder="Network name" className="input max-w-[14rem]" />
              <input name="shortName" required placeholder="Short" className="input max-w-[6rem]" />
              <input name="tier" type="number" min={1} max={4} defaultValue={2} className="input max-w-[4rem]" aria-label="Tier" />
              <Submit className="btn-primary btn-sm">Add network</Submit>
            </ActionForm>
          </Card>
          <Card title={`Rivalries (${rivalries.length})`}>
            <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto text-sm">{rivalries.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2"><span><b>{r.name}</b> <span className="text-muted">{r.a} vs {r.b}{r.trophy ? ` · ${r.trophy}` : ''}</span></span>
                <ActionForm action={deleteRivalryAction} confirm="Remove this rivalry?"><input type="hidden" name="id" value={r.id} /><Submit className="btn-ghost btn-sm">✕</Submit></ActionForm></li>
            ))}</ul>
            <ActionForm action={saveRivalryAction} resetOnSuccess className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
              <input name="name" required placeholder="Rivalry name" className="input" />
              <input name="trophy" placeholder="Trophy (optional)" className="input" />
              <select name="teamAId" className="input">{teams.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select>
              <select name="teamBId" className="input">{teams.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="annual" defaultChecked /> Play annually (scheduled in rivalry week)</label>
              <Submit className="btn-primary btn-sm">Add rivalry</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
