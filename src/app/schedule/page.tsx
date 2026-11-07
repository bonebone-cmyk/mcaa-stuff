import Link from 'next/link';
import { Badge, Card, DemoBadge, EmptyState, FilterBar, PageHeader, Select, TeamLink } from '@/components/ui';
import { kickoffLabel } from '@/components/games/game-card';
import { getConferences, getGames, getRankMap, getSeasons, getTeamMap, getTeams, resolveSeason, weekLabel } from '@/lib/queries';

export const metadata = { title: 'Schedule' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; team?: string; conf?: string; season?: string }> }) {
  const sp = await searchParams;
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const [teamList, teams, ranks, confs, seasons] = await Promise.all([getTeams(), getTeamMap(), getRankMap(season.id), getConferences(), getSeasons()]);
  const team = teamList.find((t) => t.slug === sp.team);
  const week = sp.week ? Number(sp.week) : team ? undefined : Math.max(1, season.currentWeek);
  const games = (await getGames({ seasonId: season.id, week, teamId: team?.id }))
    .filter((g) => !sp.conf || teams.get(g.homeTeamId)?.conferenceSlug === sp.conf || teams.get(g.awayTeamId)?.conferenceSlug === sp.conf);
  return (
    <div>
      <PageHeader title="Schedule" eyebrow={<span className="flex items-center gap-2">{season.name} <DemoBadge show={season.isDemo} /></span>}>
        {team ? `${team.school} full season` : week !== undefined ? weekLabel(season, week) : 'All weeks'}
      </PageHeader>
      <FilterBar>
        <Select name="season" value={season.id} label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />
        <Select name="week" value={sp.week ?? (team ? '' : String(week))} label="Week" options={[{ value: '', label: 'All weeks' }, ...Array.from({ length: season.regularSeasonWeeks + 5 }, (_, i) => ({ value: String(i + 1), label: weekLabel(season, i + 1) }))]} />
        <Select name="team" value={sp.team} label="Team" options={[{ value: '', label: 'All teams' }, ...teamList.map((t) => ({ value: t.slug, label: t.school }))]} />
        <Select name="conf" value={sp.conf} label="Conference" options={[{ value: '', label: 'All' }, ...confs.map((c) => ({ value: c.slug, label: c.shortName }))]} />
      </FilterBar>
      <Card pad={false}>
        {games.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Wk</th><th>Matchup</th><th>Kickoff</th><th>TV</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {games.map((g) => {
                  const h = teams.get(g.homeTeamId)!;
                  const a = teams.get(g.awayTeamId)!;
                  return (
                    <tr key={g.id}>
                      <td className="tabular text-muted">{g.week}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <TeamLink team={a} rank={ranks.get(a.id)} size={20} />
                          <span className="text-xs text-muted">{g.neutralSite ? 'vs' : '@'}</span>
                          <TeamLink team={h} rank={ranks.get(h.id)} size={20} />
                        </div>
                      </td>
                      <td className="text-muted">{g.siteName ? <span className="mr-2 text-fg">{g.siteName}</span> : null}{kickoffLabel(g.kickoffAt)}</td>
                      <td className="text-muted">{g.networkShort ?? '—'}</td>
                      <td className="tabular font-semibold">{g.status === 'final' ? <Link href={`/games/${g.id}`} className="hover:text-accent">{a.abbreviation} {g.awayScore}, {h.abbreviation} {g.homeScore}{g.overtimes ? ' (OT)' : ''}</Link> : <Link href={`/games/${g.id}`} className="text-muted hover:text-accent">Preview</Link>}</td>
                      <td className="space-x-1">
                        {g.isGameOfWeek && <Badge tone="accent">GOTW</Badge>}
                        {g.isConferenceGame && <Badge>Conf</Badge>}
                        {g.isRivalry && <Badge tone="gold">{g.rivalryName ?? 'Rivalry'}</Badge>}
                        {g.gameType !== 'regular' && <Badge tone="accent">{g.gameType.replace('_', ' ')}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="card-pad"><EmptyState title="No games match" /></div>}
      </Card>
    </div>
  );
}
