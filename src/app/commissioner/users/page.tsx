import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Card } from '@/components/ui';
import { setUserRoleAction } from '../actions';

export default async function UsersPage() {
  const sql = getSql();
  const users = await sql`select p.*, u.email, (select string_agg(t.school || ' (' || s.role || ')', ', ') from team_staff s join teams t on t.id = s.team_id where s.user_id = p.id) as teams
                          from profiles p left join auth.users u on u.id = p.id order by p.role, p.created_at`;
  return (
    <Card title={`Users (${users.length})`} pad={false}>
      <p className="px-4 pt-3 text-sm text-muted">Assign teams from each team’s edit page (Teams → Edit → Owner & Coaching Staff). Users sign up themselves; new accounts start as Viewer/Fan.</p>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Programs</th><th>Joined</th><th>Role</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.displayName}</td><td className="text-muted">{u.email}</td><td className="text-sm">{u.teams ?? '—'}</td>
              <td className="text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>
                <ActionForm action={setUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input !w-36 !py-1"><option value="viewer">Viewer / Fan</option><option value="owner">Team Owner</option><option value="commissioner">Commissioner</option></select>
                  <Submit className="btn-ghost btn-sm">Save</Submit>
                </ActionForm>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
