import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { Card, DemoBadge, EmptyState, FilterBar, PageHeader, Select, TeamLink, TeamLogo } from '@/components/ui';
import { getConferenceStandings, getRankMap, getSeasons, getTeamMap, resolveSeason } from '@/lib/queries';

export default async function ConferencePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ season?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const sql = getSql();
  const [conf] = await sql`select * from conferences where slug = ${slug}`;
  if (!conf) notFound();
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const [standings, teams, ranks, seasons, champs] = await Promise.all([
    getConferenceStandings(season.id, conf.id), getTeamMap(), getRankMap(season.id), getSeasons(),
    sql`select c.team_id, s.year, s.is_demo from championships c join seasons s on s.id = c.season_id where c.conference_id = ${conf.id} order by s.year desc`,
  ]);
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-3"><TeamLogo team={{ logoUrl: conf.logoUrl, abbreviation: conf.shortName }} size={44} />{conf.name}</span>} eyebrow={<span className="flex items-center gap-2">{season.name}<DemoBadge show={season.isDemo} /></span>}>
        Standings order: conference win % → head-to-head among tied teams → overall win % → point differential.
      </PageHeader>
      <FilterBar><Select name="season" value={season.id} label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} /></FilterBar>
      <div className="grid gap-6 lg:grid-cols-4">
        <Card pad={false} className="lg:col-span-3" title="Standings">
          {standings.length ? (
            <div className="overflow-x-auto">
              <table className="table tabular">
                <thead><tr><th>#</th><th>Team</th><th className="text-right">Conf</th><th className="text-right">Pct</th><th className="text-right">Overall</th><th className="text-right">Home</th><th className="text-right">Away</th><th className="text-right">PF</th><th className="text-right">PA</th><th className="text-right">Diff</th><th className="text-right">SOS</th><th className="text-right">Strk</th></tr></thead>
                <tbody>{standings.map((s, i) => {
                  const t = teams.get(s.teamId);
                  if (!t) return null;
                  const r = s.record;
                  const gp = r.confWins + r.confLosses;
                  return (
                    <tr key={s.teamId} className={i === 1 ? 'border-b-2 border-dashed border-accent' : ''}>
                      <td className="text-muted">{i + 1}</td><td><TeamLink team={t} rank={ranks.get(t.id)} /></td>
                      <td className="text-right font-semibold">{r.confWins}-{r.confLosses}</td><td className="text-right">{gp ? (r.confWins / gp).toFixed(3).replace(/^0/, '') : '.000'}</td>
                      <td className="text-right">{r.wins}-{r.losses}</td><td className="text-right">{r.homeWins}-{r.homeLosses}</td><td className="text-right">{r.awayWins}-{r.awayLosses}</td>
                      <td className="text-right">{r.pointsFor}</td><td className="text-right">{r.pointsAgainst}</td>
                      <td className={`text-right ${r.pointsFor - r.pointsAgainst >= 0 ? 'text-win' : 'text-loss'}`}>{r.pointsFor - r.pointsAgainst > 0 ? '+' : ''}{r.pointsFor - r.pointsAgainst}</td>
                      <td className="text-right">{s.sos.toFixed(3).replace(/^0/, '')}</td><td className="text-right">{r.streak}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <div className="card-pad"><EmptyState title="No members this season" /></div>}
          <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Dashed line: top two advance to the conference championship game.</div>
        </Card>
        <Card title="Champions">
          {champs.length ? <ul className="space-y-2 text-sm">{champs.map((c, i) => { const t = teams.get(c.teamId); return t ? <li key={i} className="flex items-center justify-between"><span className="font-display text-lg font-bold">{c.year}</span><TeamLink team={t} short /></li> : null; })}</ul> : <p className="text-sm text-muted">No champions crowned yet.</p>}
        </Card>
      </div>
    </div>
  );
}
