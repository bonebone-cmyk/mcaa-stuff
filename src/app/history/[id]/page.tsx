import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, PageHeader, TeamLink, TeamLogo } from '@/components/ui';
import { getTeamMap, PHASE_LABEL } from '@/lib/queries';

export default async function SeasonHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSql();
  const [season] = await sql`select * from seasons where id = ${id}`;
  if (!season) notFound();
  const teams = await getTeamMap();
  const [finalPoll, champs, leaders, records] = await Promise.all([
    sql`select r.* from rankings r where r.season_id = ${id} and (r.poll, r.week) = (select poll, week from rankings where season_id = ${id} order by week desc, (poll = 'playoff') desc, (poll = 'media') desc limit 1) order by rank`,
    sql`select c.*, cf.short_name from championships c left join conferences cf on cf.id = c.conference_id where c.season_id = ${id} order by c.kind desc, cf.short_name`,
    sql`select * from (
          (select 'Passing yards' as cat, player_id, team_id, pass_yds as v from player_season_stats where season_id = ${id} order by pass_yds desc limit 1)
          union all (select 'Rushing yards', player_id, team_id, rush_yds from player_season_stats where season_id = ${id} order by rush_yds desc limit 1)
          union all (select 'Receiving yards', player_id, team_id, rec_yds from player_season_stats where season_id = ${id} order by rec_yds desc limit 1)
          union all (select 'Total TDs', player_id, team_id, pass_td + rush_td + rec_td from player_season_stats where season_id = ${id} order by pass_td + rush_td + rec_td desc limit 1)
          union all (select 'Tackles', player_id, team_id, tackles from player_season_stats where season_id = ${id} order by tackles desc limit 1)
          union all (select 'Sacks', player_id, team_id, sacks from player_season_stats where season_id = ${id} order by sacks desc limit 1)
        ) x`,
    sql`select * from team_records where season_id = ${id} order by wins desc, losses asc limit 10`,
  ]);
  const names = leaders.length ? await sql`select id, first_name, last_name from players where id in ${sql(leaders.map((l) => l.playerId))}` : [];
  const nm = new Map(names.map((n) => [n.id, `${n.firstName} ${n.lastName}`]));
  return (
    <div>
      <PageHeader title={season.name} eyebrow={<span className="flex items-center gap-2">Season archive <DemoBadge show={season.isDemo} /><Badge>{PHASE_LABEL[season.phase]}</Badge></span>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Final Top 25" pad={false} className="lg:col-span-1">
          <ol className="divide-y divide-line/60">{finalPoll.map((r) => { const t = teams.get(r.teamId); return t ? <li key={r.rank} className="flex items-center gap-3 px-4 py-1.5 text-sm"><span className="tabular w-5 text-right font-bold">{r.rank}</span><TeamLink team={t} size={20} className="flex-1" /><span className="text-xs text-muted">{r.record}</span></li> : null; })}</ol>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Champions">
            {champs.length ? <ul className="grid gap-2 sm:grid-cols-2">{champs.map((c) => { const t = teams.get(c.teamId); return t ? <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2"><TeamLogo team={t} size={32} /><div><div className="eyebrow">{c.kind === 'national' ? 'National Champion' : `${c.shortName} Champion`}</div><div className="font-semibold">{t.school}</div></div></li> : null; })}</ul> : <p className="text-sm text-muted">No champions crowned this season.</p>}
          </Card>
          <Card title="Statistical Leaders" pad={false}>
            <table className="table tabular"><tbody>{leaders.map((l) => <tr key={l.cat}><td className="text-muted">{l.cat}</td><td><Link href={`/players/${l.playerId}`} className="font-semibold hover:text-accent">{nm.get(l.playerId)}</Link> <span className="text-xs text-muted">{teams.get(l.teamId)?.abbreviation}</span></td><td className="text-right font-bold">{Number(l.v)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Best Records" pad={false}>
            <table className="table tabular"><tbody>{records.map((r) => { const t = teams.get(r.teamId); return t ? <tr key={r.teamId}><td><TeamLink team={t} /></td><td className="text-right">{r.wins}-{r.losses}</td><td className="text-right text-muted">{r.pointsFor}-{r.pointsAgainst}</td></tr> : null; })}</tbody></table>
          </Card>
        </div>
      </div>
    </div>
  );
}
