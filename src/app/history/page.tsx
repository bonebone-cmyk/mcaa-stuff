import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, PageHeader, TeamLogo } from '@/components/ui';
import { getTeamMap, PHASE_LABEL } from '@/lib/queries';

export const metadata = { title: 'History' };

export default async function HistoryPage() {
  const sql = getSql();
  const [seasons, teams, rivalries] = await Promise.all([
    sql`select s.*, (select count(*)::int from games g where g.season_id = s.id and g.status = 'final') as finals from seasons s order by year desc`,
    getTeamMap(),
    sql`select r.*,
      (select count(*)::int from games g where g.status = 'final' and g.game_type <> 'exhibition' and g.winner_team_id = r.team_a_id and ((g.home_team_id = r.team_a_id and g.away_team_id = r.team_b_id) or (g.home_team_id = r.team_b_id and g.away_team_id = r.team_a_id))) as a_wins,
      (select count(*)::int from games g where g.status = 'final' and g.game_type <> 'exhibition' and g.winner_team_id = r.team_b_id and ((g.home_team_id = r.team_a_id and g.away_team_id = r.team_b_id) or (g.home_team_id = r.team_b_id and g.away_team_id = r.team_a_id))) as b_wins
      from rivalries r order by r.name`,
  ]);
  const confChamps = await sql`select c.season_id, c.team_id, cf.short_name from championships c join conferences cf on cf.id = c.conference_id where c.kind = 'conference'`;
  return (
    <div>
      <PageHeader title="History">Every season stays in the archive — official results only. Lore lives in News & Lore.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {seasons.length ? seasons.map((s) => {
            const champ = s.championTeamId ? teams.get(s.championTeamId) : null;
            const cc = confChamps.filter((c) => c.seasonId === s.id);
            return (
              <Link key={s.id} href={`/history/${s.id}`} className="card card-pad group block transition hover:-translate-y-0.5">
                <div className="flex items-center gap-4">
                  <div className="font-display text-4xl font-black text-muted group-hover:text-accent">{s.year}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-semibold">{s.name}<DemoBadge show={s.isDemo} /><Badge>{PHASE_LABEL[s.phase]}</Badge></div>
                    <div className="text-sm text-muted">{s.finals} official games played</div>
                  </div>
                  {champ ? <div className="flex items-center gap-2 text-right"><div><div className="eyebrow">Champion</div><div className="font-display text-lg font-bold">{champ.school}</div></div><TeamLogo team={champ} size={44} /></div> : null}
                </div>
                {cc.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{cc.map((c) => { const t = teams.get(c.teamId); return t ? <span key={c.shortName} className="chip"><TeamLogo team={t} size={16} />{c.shortName}: {t.abbreviation}</span> : null; })}</div>}
              </Link>
            );
          }) : <EmptyState title="No seasons yet" />}
        </div>
        <Card title="Rivalry Series" pad={false}>
          <ul className="divide-y divide-line/60">
            {rivalries.map((r) => {
              const a = teams.get(r.teamAId);
              const b = teams.get(r.teamBId);
              if (!a || !b) return null;
              return (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="font-semibold">{r.name}</div>
                  <div className="flex items-center gap-2 text-muted"><TeamLogo team={a} size={16} />{a.abbreviation} <span className="tabular font-bold text-fg">{r.aWins}–{r.bWins}</span> {b.abbreviation}<TeamLogo team={b} size={16} />{r.trophy && <span className="truncate text-xs">· {r.trophy}</span>}</div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
