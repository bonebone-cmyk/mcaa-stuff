import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card, RatingPill, TeamLogo } from '@/components/ui';
import { getTeams } from '@/lib/queries';
import { TeamForm } from './team-form';

export default async function CommissionerTeams() {
  const sql = getSql();
  const [teams, confs, staff, inactive] = await Promise.all([
    getTeams(), sql`select id, name, short_name from conferences order by name`,
    sql`select s.team_id, p.display_name, s.role from team_staff s join profiles p on p.id = s.user_id`,
    sql`select id, school, slug from teams where not active order by school`,
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title={`Programs (${teams.length})`} pad={false} className="lg:col-span-2">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="table">
            <thead><tr><th>Team</th><th>Conference</th><th>Owner</th><th className="text-right">OVR</th><th></th></tr></thead>
            <tbody>{teams.map((t) => (
              <tr key={t.id}>
                <td><span className="flex items-center gap-2 font-semibold"><TeamLogo team={t} size={22} />{t.school}</span></td>
                <td className="text-muted">{t.conferenceName ?? '—'}</td>
                <td className="text-sm">{staff.filter((s) => s.teamId === t.id && s.role === 'owner').map((s) => s.displayName).join(', ') || <span className="text-muted">AI</span>}</td>
                <td className="text-right"><RatingPill value={t.overallRating} /></td>
                <td className="text-right"><Link href={`/commissioner/teams/${t.id}`} className="btn-ghost btn-sm">Edit</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {inactive.length > 0 && <div className="border-t border-line p-3 text-xs text-muted">Inactive: {inactive.map((t) => <Link key={t.id} href={`/commissioner/teams/${t.id}`} className="mr-2 underline">{t.school}</Link>)}</div>}
      </Card>
      <Card title="Create a Program">
        <p className="mb-3 text-sm text-muted">Add fictional schools or renamed programs. Generate a roster for it afterwards from its edit page.</p>
        <TeamForm conferences={confs.map((c) => ({ id: c.id, name: c.name }))} />
      </Card>
    </div>
  );
}
