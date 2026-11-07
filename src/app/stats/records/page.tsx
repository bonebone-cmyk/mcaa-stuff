import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card, PageHeader, TeamLogo } from '@/components/ui';
import { getTeamMap } from '@/lib/queries';

export const metadata = { title: 'Record Book' };

const STATS: [string, string][] = [['pass_yds', 'Passing yards'], ['pass_td', 'Passing TDs'], ['rush_yds', 'Rushing yards'], ['rush_td', 'Rushing TDs'], ['rec_yds', 'Receiving yards'], ['rec', 'Receptions'], ['rec_td', 'Receiving TDs'], ['tackles', 'Tackles'], ['sacks', 'Sacks'], ['def_int', 'Interceptions']];

export default async function RecordsPage() {
  const sql = getSql();
  const teams = await getTeamMap();
  const official = sql`g.status = 'final' and g.game_type <> 'exhibition'`;
  const [singleGame, singleSeason, career, teamGame, teamSeason, margins, confTitles] = await Promise.all([
    Promise.all(STATS.map(([k]) => sql`select s.${sql(k)} as v, s.player_id, s.team_id, s.game_id, p.first_name, p.last_name, se.year from player_game_stats s
      join games g on g.id = s.game_id join players p on p.id = s.player_id join seasons se on se.id = g.season_id where ${official} order by s.${sql(k)} desc limit 1`)),
    Promise.all(STATS.map(([k]) => sql`select ps.${sql(k)} as v, ps.player_id, ps.team_id, p.first_name, p.last_name, se.year from player_season_stats ps
      join players p on p.id = ps.player_id join seasons se on se.id = ps.season_id order by ps.${sql(k)} desc limit 1`)),
    Promise.all(STATS.map(([k]) => sql`select sum(ps.${sql(k)}) as v, ps.player_id, p.first_name, p.last_name, p.team_id from player_season_stats ps
      join players p on p.id = ps.player_id group by ps.player_id, p.first_name, p.last_name, p.team_id order by v desc limit 1`)),
    sql`select t.team_id, t.points, g.id as game_id, se.year, g.week from team_game_stats t join games g on g.id = t.game_id join seasons se on se.id = g.season_id where ${official} order by t.points desc limit 5`,
    sql`select r.*, se.year from team_records r join seasons se on se.id = r.season_id order by r.wins desc, r.losses asc, (r.points_for - r.points_against) desc limit 5`,
    sql`select g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score, se.year, abs(g.home_score - g.away_score) as m from games g join seasons se on se.id = g.season_id where ${official} order by m desc limit 5`,
    sql`select team_id, count(*)::int as n from championships where kind = 'conference' group by team_id order by n desc limit 10`,
  ]);
  const Row = ({ label, r, game }: { label: string; r: any; game?: boolean }) => r ? (
    <tr><td className="text-muted">{label}</td><td><Link href={`/players/${r.playerId}`} className="font-semibold hover:text-accent">{r.firstName} {r.lastName}</Link> <span className="text-xs text-muted">{teams.get(r.teamId)?.abbreviation}{r.year ? ` · ${r.year}` : ''}</span></td><td className="tabular text-right font-bold">{game ? <Link href={`/games/${r.gameId}`} className="hover:text-accent">{Number(r.v)}</Link> : Number(r.v)}</td></tr>
  ) : null;
  return (
    <div>
      <PageHeader title="Record Book">Permanent records from official results across every season in the universe.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Single Game" pad={false}><table className="table"><tbody>{STATS.map(([, l], i) => <Row key={l} label={l} r={singleGame[i][0]} game />)}</tbody></table></Card>
        <Card title="Single Season" pad={false}><table className="table"><tbody>{STATS.map(([, l], i) => <Row key={l} label={l} r={singleSeason[i][0]} />)}</tbody></table></Card>
        <Card title="Career" pad={false}><table className="table"><tbody>{STATS.map(([, l], i) => <Row key={l} label={l} r={career[i][0]} />)}</tbody></table></Card>
        <Card title="Team · Most Points in a Game" pad={false}><table className="table"><tbody>{teamGame.map((r) => { const t = teams.get(r.teamId); return t ? <tr key={r.gameId}><td><span className="flex items-center gap-2"><TeamLogo team={t} size={18} />{t.school}</span></td><td className="text-muted">{r.year} Wk {r.week}</td><td className="tabular text-right font-bold"><Link href={`/games/${r.gameId}`}>{r.points}</Link></td></tr> : null; })}</tbody></table></Card>
        <Card title="Team · Best Seasons" pad={false}><table className="table"><tbody>{teamSeason.map((r) => { const t = teams.get(r.teamId); return t ? <tr key={`${r.seasonId}${r.teamId}`}><td><span className="flex items-center gap-2"><TeamLogo team={t} size={18} />{t.school}</span></td><td className="text-muted">{r.year}</td><td className="tabular text-right font-bold">{r.wins}-{r.losses}</td></tr> : null; })}</tbody></table></Card>
        <Card title="Largest Margins of Victory" pad={false}><table className="table"><tbody>{margins.map((g) => { const h = teams.get(g.homeTeamId); const a = teams.get(g.awayTeamId); return <tr key={g.id}><td><Link href={`/games/${g.id}`} className="hover:text-accent">{a?.abbreviation} {g.awayScore} @ {h?.abbreviation} {g.homeScore}</Link></td><td className="text-muted">{g.year}</td><td className="tabular text-right font-bold">{g.m}</td></tr>; })}</tbody></table></Card>
        <Card title="Conference Titles" pad={false}><table className="table"><tbody>{confTitles.length ? confTitles.map((r) => { const t = teams.get(r.teamId); return t ? <tr key={r.teamId}><td><span className="flex items-center gap-2"><TeamLogo team={t} size={18} />{t.school}</span></td><td className="tabular text-right font-bold">{r.n}</td></tr> : null; }) : <tr><td className="text-muted">None yet</td></tr>}</tbody></table></Card>
        <Card title="Rivalry Series">
          <p className="text-sm text-muted">All-time series records for every designated rivalry live in <Link href="/history" className="font-semibold text-accent">History</Link> and on each team’s Rivalries tab.</p>
        </Card>
      </div>
    </div>
  );
}
