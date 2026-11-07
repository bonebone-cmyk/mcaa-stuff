import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, FilterBar, Movement, PageHeader, Select, TeamLink } from '@/components/ui';
import { getLatestPoll, getSeasons, getTeamMap, resolveSeason, weekLabel } from '@/lib/queries';

export const metadata = { title: 'Rankings' };
const POLLS = [
  { key: 'media', label: 'Media Poll' }, { key: 'coaches', label: 'Coaches Poll' },
  { key: 'computer', label: 'Computer Rankings' }, { key: 'playoff', label: 'Playoff Rankings' },
];
const BREAKDOWN_LABELS: Record<string, string> = {
  winPct: 'Win %', strengthOfSchedule: 'SOS', qualityWins: 'Quality wins', badLosses: 'Bad losses', power: 'Power (SRS)',
  conferenceTitle: 'Conf. title', recentForm: 'Recent form', losses: 'Loss penalty',
};

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ poll?: string; week?: string; season?: string }> }) {
  const sp = await searchParams;
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const poll = POLLS.some((p) => p.key === sp.poll) ? sp.poll! : 'media';
  const [teams, seasons, weeks] = await Promise.all([getTeamMap(), getSeasons(), getSql()`select distinct week from rankings where season_id = ${season.id} and poll = ${poll} order by week desc`]);
  const data = await getLatestPoll(season.id, poll, sp.week !== undefined && sp.week !== '' ? Number(sp.week) : undefined);
  const isManual = data.rows.some((r) => r.isManual);
  return (
    <div>
      <PageHeader title="Rankings" eyebrow={<span className="flex items-center gap-2">{season.name}<DemoBadge show={season.isDemo} /></span>}>
        {data.week != null ? `${POLLS.find((p) => p.key === poll)!.label} · after ${weekLabel(season, data.week)}` : 'No rankings published yet'}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-1">
        {POLLS.map((p) => <Link key={p.key} href={`/rankings?poll=${p.key}&season=${season.id}`} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${poll === p.key ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'}`}>{p.label}</Link>)}
      </div>
      <FilterBar>
        <input type="hidden" name="poll" value={poll} />
        <Select name="season" value={season.id} label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />
        <Select name="week" value={data.week != null ? String(data.week) : ''} label="Week" options={weeks.map((w) => ({ value: String(w.week), label: weekLabel(season, w.week) }))} />
      </FilterBar>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card pad={false} className="lg:col-span-2">
          {data.rows.length ? (
            <div className="overflow-x-auto">
              <table className="table tabular">
                <thead><tr><th>Rk</th><th>Team</th><th>Record</th><th className="text-right">{poll === 'coaches' || poll === 'media' ? 'Points' : 'Score'}</th><th className="text-right">Prev</th><th></th></tr></thead>
                <tbody>{data.rows.map((r) => {
                  const t = teams.get(r.teamId);
                  if (!t) return null;
                  return (
                    <tr key={r.rank}>
                      <td className="font-display text-lg font-bold">{r.rank}</td>
                      <td><TeamLink team={t} size={26} />{r.firstPlaceVotes > 0 && <span className="ml-2 text-xs text-muted">({r.firstPlaceVotes})</span>}</td>
                      <td>{r.record}</td>
                      <td className="text-right">{poll === 'coaches' || poll === 'media' ? r.points : r.score != null ? Number(r.score).toFixed(2) : '—'}</td>
                      <td className="text-right text-muted">{r.previousRank ?? '—'}</td>
                      <td className="text-right"><Movement current={r.rank} previous={r.previousRank} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <div className="card-pad"><EmptyState title="No poll released for this week" /></div>}
        </Card>
        <div className="space-y-6">
          <Card title="Methodology">
            {isManual && <Badge tone="accent" className="mb-2">Commissioner-set poll</Badge>}
            <div className="space-y-2 text-sm text-muted">
              {poll === 'computer' && <p>A transparent formula: win %, strength of schedule (opponents’ and opponents’ opponents’ records), quality wins vs. top-50 power teams, bad losses, a margin-capped SRS power rating, conference titles and recent form, then a head-to-head correction for near-ties.</p>}
              {poll === 'coaches' && <p>62 simulated coaches each submit a top-25 ballot from the computer resume plus poll inertia (last week’s rank) and a loss penalty. 25 points for first, 1 for 25th.</p>}
              {poll === 'media' && <p>60 simulated media voters, weighing the resume plus program brand and recent form with more variance than coaches.</p>}
              {poll === 'playoff' && <p>Committee rankings use the resume only — no inertia — weighting strength of schedule, quality wins, bad losses and conference titles more heavily. Used to seed the playoff.</p>}
            </div>
          </Card>
          {poll === 'computer' && data.rows[0]?.breakdown && (
            <Card title="Formula breakdown · Top 10" pad={false}>
              <div className="overflow-x-auto">
                <table className="table tabular text-xs">
                  <thead><tr><th>Team</th>{Object.keys(BREAKDOWN_LABELS).map((k) => <th key={k} className="text-right">{BREAKDOWN_LABELS[k]}</th>)}</tr></thead>
                  <tbody>{data.rows.slice(0, 10).map((r) => (
                    <tr key={r.rank}><td className="font-semibold">{teams.get(r.teamId)?.abbreviation}</td>{Object.keys(BREAKDOWN_LABELS).map((k) => <td key={k} className="text-right">{r.breakdown?.[k] ?? 0}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
