import Link from 'next/link';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, EmptyState, Meter, PageHeader, Stars, StatTile, TeamLogo } from '@/components/ui';
import { requireActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { getCurrentSeason, getTeamMap } from '@/lib/queries';
import { getSettings } from '@/lib/services/settings';
import { cancelRecruitAction } from '../actions';

export const metadata = { title: 'Recruiting Board' };

export default async function RecruitingBoardPage() {
  const actor = await requireActor();
  const teamId = actorTeamId(actor);
  const season = await getCurrentSeason();
  if (!teamId || !season) return <EmptyState title="No program assigned" />;
  const sql = getSql();
  const [teams, settings] = await Promise.all([getTeamMap(), getSettings(sql)]);
  const rules = settings.recruitingRules;
  const week = season.currentWeek;
  const [[budget], board, queued, [{ offers }]] = await Promise.all([
    sql`select * from recruiting_budgets where season_id = ${season.id} and week = ${week} and team_id = ${teamId}`,
    sql`select i.*, r.first_name, r.last_name, r.position, r.stars, r.national_rank, r.status, r.committed_team_id, r.hometown, r.is_transfer
        from recruit_interest i join recruits r on r.id = i.recruit_id
        where i.team_id = ${teamId} and r.season_id = ${season.id} and r.status <> 'withdrawn' order by i.offered desc, i.interest desc limit 60`,
    sql`select a.*, r.first_name, r.last_name from recruiting_actions a join recruits r on r.id = a.recruit_id where a.team_id = ${teamId} and a.season_id = ${season.id} and a.week = ${week} and not a.is_ai order by a.created_at desc`,
    sql`select count(*)::int as offers from recruit_interest i join recruits r on r.id = i.recruit_id where i.team_id = ${teamId} and i.offered and r.season_id = ${season.id} and r.status <> 'signed'`,
  ]);
  const total = budget?.pointsTotal ?? rules.weeklyPoints;
  const left = total - (budget?.pointsSpent ?? 0);
  return (
    <div>
      <PageHeader title="Recruiting Board" eyebrow={teams.get(teamId)?.school} actions={<Link href="/recruiting" className="btn-primary">Find prospects</Link>}>
        Queue actions this week; the recruiting engine resolves them when the commissioner advances the week.
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Points left" value={left} sub={`of ${total} this week`} />
        <StatTile label="Active offers" value={offers} sub={`limit ${rules.maxActiveOffers}`} />
        <StatTile label="Signing day" value={`Week ${rules.signingDayWeek}`} sub={week > rules.signingDayWeek ? 'passed' : `${rules.signingDayWeek - week} weeks away`} />
        <StatTile label="Approval" value={rules.requireApproval ? 'Required' : 'Automatic'} sub="commissioner setting" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card pad={false} title="Your Board" className="lg:col-span-2">
          {board.length ? (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Prospect</th><th>Pos</th><th>Rating</th><th className="w-40">Interest</th><th>Status</th></tr></thead>
              <tbody>{board.map((b) => (
                <tr key={b.recruitId}>
                  <td><Link href={`/recruiting/${b.recruitId}`} className="font-semibold hover:text-accent">{b.firstName} {b.lastName}</Link><div className="text-xs text-muted">{b.isTransfer ? 'Transfer' : `#${b.nationalRank}`} · {b.hometown}</div></td>
                  <td>{b.position}</td><td><Stars n={b.stars} /></td>
                  <td><div className="flex items-center gap-2"><Meter value={b.interest} /><span className="tabular w-7 text-right text-xs font-bold">{Math.round(b.interest)}</span></div></td>
                  <td className="space-x-1">{b.offered && <Badge tone="accent">Offer</Badge>}{b.visited && <Badge tone="win">Visited</Badge>}{b.scouted && <Badge>Scouted</Badge>}
                    {b.committedTeamId && (() => { const t = teams.get(b.committedTeamId); return t ? <span className="inline-flex items-center gap-1 align-middle"><TeamLogo team={t} size={16} /><span className="text-xs">{b.status}</span></span> : null; })()}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="card-pad"><EmptyState title="Your board is empty"><Link href="/recruiting" className="text-accent">Browse the prospect rankings</Link> to start.</EmptyState></div>}
        </Card>
        <Card title={`Queued This Week (${queued.length})`}>
          {queued.length ? (
            <ul className="space-y-2">{queued.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span><span className="font-semibold">{a.firstName} {a.lastName}</span><span className="block text-xs capitalize text-muted">{a.actionType.replace('_', ' ')}{a.pitchAngle ? ` · ${a.pitchAngle}` : ''} · {a.points} pts · {a.status}{a.resultNote ? ` · ${a.resultNote}` : ''}</span></span>
                {(a.status === 'pending' || a.status === 'approved') && <ActionForm action={cancelRecruitAction}><input type="hidden" name="actionId" value={a.id} /><Submit className="btn-ghost btn-sm">Cancel</Submit></ActionForm>}
              </li>
            ))}</ul>
          ) : <p className="text-sm text-muted">No actions queued. Open a prospect to scout, contact, offer, schedule visits or pitch.</p>}
        </Card>
      </div>
    </div>
  );
}
