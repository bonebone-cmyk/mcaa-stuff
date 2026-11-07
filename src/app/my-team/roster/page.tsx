import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { requireActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { getTeamMap } from '@/lib/queries';
import { classLabel, DEFENSE_SCHEMES, OFFENSE_SCHEMES, POSITIONS, SCHEME_LABELS, STARTERS } from '@/lib/players/positions';
import { strategyAction } from '../actions';
import { DepthEditor } from './depth-editor';

export const metadata = { title: 'Roster & Depth Chart' };

export default async function RosterPage() {
  const actor = await requireActor();
  const teamId = actorTeamId(actor);
  if (!teamId) return <EmptyState title="No program assigned" />;
  const sql = getSql();
  const [teams, [team], players] = await Promise.all([
    getTeamMap(),
    sql`select * from teams where id = ${teamId}`,
    sql`select p.*, d.depth from players p left join depth_chart d on d.player_id = p.id and d.slot = p.position
        where p.team_id = ${teamId} and p.status = 'active' order by p.position, d.depth nulls last, p.overall desc`,
  ]);
  return (
    <div>
      <PageHeader title="Roster & Depth Chart" eyebrow={teams.get(teamId)?.school}>Starters are highlighted. Injured players are skipped automatically in simulations; ratings update when you save.</PageHeader>
      <Card title="Team Strategy" className="mb-6">
        <ActionForm action={strategyAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <label><span className="label">Offensive scheme</span><select name="offenseScheme" defaultValue={team.offenseScheme} className="input">{OFFENSE_SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABELS[s]}</option>)}</select></label>
          <label><span className="label">Defensive scheme</span><select name="defenseScheme" defaultValue={team.defenseScheme} className="input">{DEFENSE_SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABELS[s]}</option>)}</select></label>
          <Submit>Save schemes</Submit>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">Schemes change run/pass tendencies and matchups in the simulation, and affect scheme fit for recruits.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {POSITIONS.map((pos) => (
          <DepthEditor key={pos} teamId={teamId} slot={pos} starters={STARTERS[pos]}
            players={players.filter((p) => p.position === pos).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, overall: p.overall, injured: p.injuryWeeks > 0, cls: classLabel(p.seasonsPlayed, p.redshirtUsed) }))} />
        ))}
      </div>
    </div>
  );
}
