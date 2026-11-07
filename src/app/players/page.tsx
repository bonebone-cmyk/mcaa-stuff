import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card, EmptyState, FilterBar, PageHeader, RatingPill, Select, Stars, TeamLogo } from '@/components/ui';
import { getTeamMap, getTeams } from '@/lib/queries';
import { classLabel, POSITIONS } from '@/lib/players/positions';

export const metadata = { title: 'Players' };

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sql = getSql();
  const [teamList, teams] = await Promise.all([getTeams(), getTeamMap()]);
  const team = teamList.find((t) => t.slug === sp.team);
  const page = Math.max(1, Number(sp.page ?? 1));
  const status = sp.status ?? 'active';
  const where = sql`status = ${status} ${sp.pos ? sql`and position = ${sp.pos}` : sql``} ${team ? sql`and team_id = ${team.id}` : sql``}
    ${sp.q ? sql`and (first_name || ' ' || last_name) ilike ${'%' + sp.q + '%'}` : sql``}`;
  const [rows, [{ n }]] = await Promise.all([
    sql`select * from players where ${where} order by overall desc, last_name limit 50 offset ${(page - 1) * 50}`,
    sql`select count(*)::int as n from players where ${where}`,
  ]);
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;
  return (
    <div>
      <PageHeader title="Players">{n} players</PageHeader>
      <FilterBar>
        <label className="min-w-[12rem] flex-1"><span className="label">Name</span><input name="q" defaultValue={sp.q} className="input" /></label>
        <Select name="pos" value={sp.pos} label="Position" options={[{ value: '', label: 'All' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} />
        <Select name="team" value={sp.team} label="Team" options={[{ value: '', label: 'All teams' }, ...teamList.map((t) => ({ value: t.slug, label: t.school }))]} />
        <Select name="status" value={status} label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'portal', label: 'In portal' }, { value: 'graduated', label: 'Graduated' }, { value: 'departed', label: 'Departed' }]} />
      </FilterBar>
      <Card pad={false}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Class</th><th>Stars</th><th className="text-right">OVR</th><th className="text-right">POT</th></tr></thead>
              <tbody>{rows.map((p) => { const t = p.teamId ? teams.get(p.teamId) : null; return (
                <tr key={p.id}>
                  <td><Link href={`/players/${p.id}`} className="font-semibold hover:text-accent">{p.firstName} {p.lastName}</Link>{p.injuryWeeks > 0 && <span className="ml-2 text-xs text-loss">INJ</span>}</td>
                  <td>{p.position}</td>
                  <td>{t ? <Link href={`/teams/${t.slug}`} className="flex items-center gap-2 hover:text-accent"><TeamLogo team={t} size={20} />{t.abbreviation}</Link> : '—'}</td>
                  <td className="text-muted">{classLabel(p.seasonsPlayed, p.redshirtUsed, p.status)}</td>
                  <td><Stars n={p.stars} /></td><td className="text-right"><RatingPill value={p.overall} /></td><td className="tabular text-right text-muted">{p.potential}</td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        ) : <div className="card-pad"><EmptyState title="No players found" /></div>}
      </Card>
      {n > 50 && <div className="mt-4 flex justify-end gap-2">{page > 1 && <Link className="btn-ghost btn-sm" href={qs(page - 1)}>← Prev</Link>}{page * 50 < n && <Link className="btn-ghost btn-sm" href={qs(page + 1)}>Next →</Link>}</div>}
    </div>
  );
}
