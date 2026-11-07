import { ActionForm, Submit } from '@/components/action-form';
import { Card, EmptyState } from '@/components/ui';
import { getCurrentSeason, getLatestPoll, getTeamMap } from '@/lib/queries';
import { generateRankingsAction, manualRankingAction } from '../actions';

export default async function CommissionerRankings() {
  const season = await getCurrentSeason();
  if (!season) return <EmptyState title="Create a season first" />;
  const [teams, media] = await Promise.all([getTeamMap(), getLatestPoll(season.id, 'media')]);
  const current = media.rows.map((r, i) => `${i + 1}. ${teams.get(r.teamId)?.school}`).join('\n');
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Generate Polls (algorithm)">
        <p className="mb-3 text-sm text-muted">Polls are generated automatically every time the week advances. Use this to regenerate after overriding a result. Commissioner-set (manual) polls for a week are never overwritten.</p>
        <ActionForm action={generateRankingsAction} className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">{['coaches', 'media', 'computer', 'playoff'].map((p) => <label key={p} className="flex items-center gap-2 capitalize"><input type="checkbox" name={p} defaultChecked={p !== 'playoff'} />{p}</label>)}</div>
          <label className="block max-w-[10rem]"><span className="label">After week</span><input name="week" type="number" min={0} defaultValue={Math.max(0, season.currentWeek - 1)} className="input" /></label>
          <Submit>Generate</Submit>
        </ActionForm>
      </Card>
      <Card title="Set a Poll Manually">
        <p className="mb-3 text-sm text-muted">One team per line (school name, abbreviation or slug), up to 25. Replaces that week’s poll and marks it commissioner-set.</p>
        <ActionForm action={manualRankingAction} className="space-y-3">
          <div className="flex gap-3">
            <label className="flex-1"><span className="label">Poll</span><select name="poll" className="input"><option value="media">Media</option><option value="coaches">Coaches</option><option value="computer">Computer</option><option value="playoff">Playoff</option></select></label>
            <label className="w-28"><span className="label">Week</span><input name="week" type="number" min={0} defaultValue={media.week ?? 0} className="input" /></label>
          </div>
          <textarea name="teams" rows={14} defaultValue={current} className="input font-mono text-xs" />
          <Submit>Save manual poll</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
