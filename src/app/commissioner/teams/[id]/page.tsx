import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, TeamLogo } from '@/components/ui';
import { assignStaffAction, deleteTeamAction, generateRosterAction, removeStaffAction, uploadLogoAction } from '../../actions';
import { TeamForm } from '../team-form';

export default async function EditTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSql();
  const [team] = await sql`select * from teams where id = ${id}`;
  if (!team) notFound();
  const [confs, staff, [{ n }]] = await Promise.all([
    sql`select id, name from conferences order by name`,
    sql`select s.*, p.display_name from team_staff s join profiles p on p.id = s.user_id where s.team_id = ${id}`,
    sql`select count(*)::int as n from players where team_id = ${id} and status = 'active'`,
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title={<span className="flex items-center gap-3"><TeamLogo team={team} size={32} /><span className="section-title">{team.school}</span>{!team.active && <Badge tone="loss">Inactive</Badge>}</span>} className="lg:col-span-2" action={<Link href={`/teams/${team.slug}`} className="text-xs font-semibold text-accent">View page →</Link>}>
        <TeamForm team={team} conferences={confs as any} />
      </Card>
      <div className="space-y-6">
        <Card title="Owner & Coaching Staff">
          <ul className="mb-3 space-y-2 text-sm">
            {staff.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-2">
                <span>{s.displayName} <Badge tone={s.role === 'owner' ? 'accent' : 'default'}>{s.role}</Badge></span>
                <ActionForm action={removeStaffAction} confirm="Remove this staff member?"><input type="hidden" name="teamId" value={id} /><input type="hidden" name="userId" value={s.userId} /><Submit className="btn-ghost btn-sm">Remove</Submit></ActionForm>
              </li>
            ))}
            {!staff.length && <li className="text-muted">Computer-controlled.</li>}
          </ul>
          <ActionForm action={assignStaffAction} resetOnSuccess className="space-y-2">
            <input type="hidden" name="teamId" value={id} />
            <input name="email" type="email" required placeholder="user@email.com" className="input" />
            <select name="role" className="input"><option value="owner">Primary owner / head coach</option><option value="assistant">Assistant coach</option></select>
            <Submit className="btn-primary btn-sm">Assign</Submit>
          </ActionForm>
        </Card>
        <Card title="Logo Upload">
          <ActionForm action={uploadLogoAction} className="space-y-2">
            <input type="hidden" name="teamId" value={id} />
            <input type="file" name="file" accept="image/*" className="text-sm" />
            <Submit className="btn-ghost btn-sm">Upload to storage</Submit>
          </ActionForm>
        </Card>
        <Card title="Roster">
          <p className="mb-2 text-sm text-muted">{n} active players.</p>
          <ActionForm action={generateRosterAction} confirm="Generate a fictional roster for this program?" className="space-y-2">
            <input type="hidden" name="teamId" value={id} />
            {n > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="replace" /> Replace current roster</label>}
            <Submit className="btn-ghost btn-sm">Generate fictional roster</Submit>
          </ActionForm>
        </Card>
        <Card title="Danger Zone">
          <ActionForm action={deleteTeamAction} confirm="Delete this program? Programs with game history are deactivated instead.">
            <input type="hidden" name="id" value={id} />
            <Submit className="btn-danger btn-sm">Delete / deactivate program</Submit>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
