import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card, EmptyState, PageHeader, Stars, TeamLogo } from '@/components/ui';
import { getCurrentSeason, getTeamMap } from '@/lib/queries';

export const metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const term = q.trim();
  if (term.length < 2) return <div><PageHeader title="Search" /><EmptyState title="Type at least two characters" /></div>;
  const sql = getSql();
  const like = `%${term}%`;
  const [teams, season] = await Promise.all([getTeamMap(), getCurrentSeason()]);
  const [teamRows, players, recruits, articles] = await Promise.all([
    sql`select id from teams where active and (school ilike ${like} or mascot ilike ${like} or abbreviation ilike ${like} or city ilike ${like}) order by prestige desc limit 12`,
    sql`select id, first_name, last_name, position, team_id, overall from players where (first_name || ' ' || last_name) ilike ${like} order by status = 'active' desc, overall desc limit 15`,
    sql`select id, first_name, last_name, position, stars, national_rank, hometown, is_transfer from recruits where (first_name || ' ' || last_name) ilike ${like} or hometown ilike ${like} order by created_at desc, national_rank limit 15`,
    sql`select slug, headline, category from articles where status = 'published' and (headline ilike ${like} or ${term} = any(tags)) order by published_at desc limit 10`,
  ]);
  const teamIds = teamRows.map((t) => t.id as string);
  const games = season && teamIds.length ? await sql`select id, week, home_team_id, away_team_id, home_score, away_score, status from games
    where season_id = ${season.id} and (home_team_id in ${sql(teamIds.slice(0, 3))} or away_team_id in ${sql(teamIds.slice(0, 3))}) order by week limit 15` : [];
  const empty = !teamRows.length && !players.length && !recruits.length && !articles.length;
  return (
    <div>
      <PageHeader title={`Search: “${term}”`} />
      {empty ? <EmptyState title="No results" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {teamRows.length > 0 && <Card title="Teams"><div className="grid gap-2 sm:grid-cols-2">{teamIds.map((id) => { const t = teams.get(id)!; return <Link key={id} href={`/teams/${t.slug}`} className="flex items-center gap-2 rounded-lg p-2 font-semibold hover:bg-surface-2"><TeamLogo team={t} size={28} />{t.school} <span className="text-xs text-muted">{t.mascot}</span></Link>; })}</div></Card>}
          {games.length > 0 && <Card title="Games"><ul className="space-y-1 text-sm">{games.map((g) => <li key={g.id}><Link href={`/games/${g.id}`} className="hover:text-accent">Wk {g.week}: {teams.get(g.awayTeamId)?.school} {g.status === 'final' ? g.awayScore : ''} @ {teams.get(g.homeTeamId)?.school} {g.status === 'final' ? g.homeScore : ''}</Link></li>)}</ul></Card>}
          {players.length > 0 && <Card title="Players"><ul className="space-y-1 text-sm">{players.map((p) => <li key={p.id} className="flex items-center gap-2">{p.teamId && teams.get(p.teamId) && <TeamLogo team={teams.get(p.teamId)!} size={18} />}<Link href={`/players/${p.id}`} className="font-semibold hover:text-accent">{p.firstName} {p.lastName}</Link><span className="text-muted">{p.position} · {p.overall}</span></li>)}</ul></Card>}
          {recruits.length > 0 && <Card title="Recruits"><ul className="space-y-1 text-sm">{recruits.map((r) => <li key={r.id} className="flex items-center gap-2"><Link href={`/recruiting/${r.id}`} className="font-semibold hover:text-accent">{r.firstName} {r.lastName}</Link><Stars n={r.stars} /><span className="text-muted">{r.position} · {r.isTransfer ? 'Transfer' : `#${r.nationalRank}`} · {r.hometown}</span></li>)}</ul></Card>}
          {articles.length > 0 && <Card title="Articles"><ul className="space-y-1 text-sm">{articles.map((a) => <li key={a.slug}><Link href={`/news/${a.slug}`} className="font-semibold hover:text-accent">{a.headline}</Link></li>)}</ul></Card>}
        </div>
      )}
    </div>
  );
}
