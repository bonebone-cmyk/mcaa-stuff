import Link from 'next/link';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Card, EmptyState, TeamLogo } from '@/components/ui';
import { getCurrentSeason, getTeamMap } from '@/lib/queries';
import { getSettings } from '@/lib/services/settings';
import { generateClassAction, reviewRecruitingActionAction, saveRecruitingRulesAction } from '../actions';

export default async function CommissionerRecruiting() {
  const sql = getSql();
  const [season, settings, teams] = await Promise.all([getCurrentSeason(), getSettings(sql), getTeamMap()]);
  const r = settings.recruitingRules;
  const pending = season ? await sql`select a.*, rc.first_name, rc.last_name, rc.stars from recruiting_actions a join recruits rc on rc.id = a.recruit_id
    where a.season_id = ${season.id} and a.status = 'pending' and not a.is_ai order by a.created_at` : [];
  const [{ n }] = season ? await sql`select count(*)::int as n from recruits where season_id = ${season.id} and not is_transfer` : [{ n: 0 }];
  const num = (name: string, label: string, v: number) => <label><span className="label">{label}</span><input name={name} type="number" defaultValue={v} className="input" /></label>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Recruiting Rules">
        <ActionForm action={saveRecruitingRulesAction} className="grid gap-3 sm:grid-cols-2">
          {num('weeklyPoints', 'Weekly points per team', r.weeklyPoints)}{num('scholarshipLimit', 'Scholarships per class', r.scholarshipLimit)}
          {num('maxActiveOffers', 'Max active offers', r.maxActiveOffers)}{num('maxVisitsPerWeek', 'Official visits per week', r.maxVisitsPerWeek)}
          {num('signingDayWeek', 'Signing day (week)', r.signingDayWeek)}{num('commitThreshold', 'Commit threshold (interest)', r.commitThreshold)}
          {num('flipMargin', 'Flip margin (interest)', r.flipMargin)}<div />
          {num('cost_scout', 'Cost · scout', r.costs.scout)}{num('cost_contact', 'Cost · contact', r.costs.contact)}
          {num('cost_offer', 'Cost · offer', r.costs.offer)}{num('cost_visit', 'Cost · visit', r.costs.visit)}{num('cost_pitch', 'Cost · pitch', r.costs.pitch)}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="requireApproval" defaultChecked={r.requireApproval} /> Require commissioner approval of owner recruiting actions</label>
          <div className="sm:col-span-2"><Submit>Save rules</Submit></div>
        </ActionForm>
      </Card>
      <div className="space-y-6">
        <Card title={`Pending Approvals (${pending.length})`}>
          {!r.requireApproval && <p className="mb-2 text-xs text-muted">Approval is off — pending actions are processed automatically when the week advances.</p>}
          {pending.length ? (
            <ul className="space-y-2">{pending.map((a) => { const t = teams.get(a.teamId); return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">{t && <TeamLogo team={t} size={18} />}<b>{t?.abbreviation}</b> <span className="capitalize">{a.actionType.replace('_', ' ')}</span> → <Link href={`/recruiting/${a.recruitId}`} className="hover:text-accent">{a.firstName} {a.lastName} ({a.stars}★)</Link></span>
                <ActionForm action={reviewRecruitingActionAction} className="flex gap-1"><input type="hidden" name="actionId" value={a.id} /><Submit name="decision" value="approve" className="btn-ghost btn-sm">Approve</Submit><Submit name="decision" value="reject" className="btn-danger btn-sm">Reject</Submit></ActionForm>
              </li>
            ); })}</ul>
          ) : <p className="text-sm text-muted">Nothing waiting.</p>}
        </Card>
        <Card title="Recruiting Class">
          {season ? (n > 0 ? <p className="text-sm">{n} high-school prospects in the class of {season.year + 1}. New classes are generated automatically when a new season starts.</p> : (
            <ActionForm action={generateClassAction} className="flex items-center gap-2">
              <input name="count" type="number" defaultValue={2000} className="input max-w-[8rem]" aria-label="Class size" /><Submit>Generate class</Submit>
            </ActionForm>
          )) : <EmptyState title="No season" />}
          <p className="mt-3 text-xs text-muted">The commissioner sets rules but never edits a recruit’s interest or decisions directly — those come only from the recruiting engine.</p>
        </Card>
      </div>
    </div>
  );
}
