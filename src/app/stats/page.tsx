import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card, DemoBadge, EmptyState, FilterBar, PageHeader, Select, TeamLink } from '@/components/ui';
import { getConferences, getSeasons, getTeamMap, getTeams, resolveSeason } from '@/lib/queries';
import { POSITIONS } from '@/lib/players/positions';

export const metadata = { title: 'Statistics' };

const CATS: Record<string, { label: string; order: string; filter: string; cols: [string, string][] }> = {
  passing: { label: 'Passing', order: 'pass_yds', filter: 'pass_att > 0', cols: [['passCmp', 'CMP'], ['passAtt', 'ATT'], ['pct', 'PCT'], ['passYds', 'YDS'], ['passTd', 'TD'], ['passInt', 'INT'], ['ypg', 'YDS/G']] },
  rushing: { label: 'Rushing', order: 'rush_yds', filter: 'rush_att > 0', cols: [['rushAtt', 'CAR'], ['rushYds', 'YDS'], ['ypc', 'AVG'], ['rushTd', 'TD'], ['ypg', 'YDS/G']] },
  receiving: { label: 'Receiving', order: 'rec_yds', filter: 'rec > 0', cols: [['rec', 'REC'], ['recYds', 'YDS'], ['ypr', 'AVG'], ['recTd', 'TD'], ['ypg', 'YDS/G']] },
  defense: { label: 'Defense', order: 'tackles', filter: 'tackles > 0 or sacks > 0 or def_int > 0', cols: [['tackles', 'TKL'], ['tfl', 'TFL'], ['sacks', 'SACK'], ['defInt', 'INT'], ['forcedFumbles', 'FF']] },
  sacks: { label: 'Sacks', order: 'sacks', filter: 'sacks > 0', cols: [['sacks', 'SACK'], ['tfl', 'TFL'], ['tackles', 'TKL']] },
  kicking: { label: 'Kicking', order: 'fgm', filter: 'fga > 0', cols: [['fgm', 'FGM'], ['fga', 'FGA'], ['fgPct', 'PCT'], ['xpm', 'XPM'], ['pts', 'PTS']] },
  returns: { label: 'Returns', order: 'kr_yds + pr_yds', filter: 'kr > 0 or pr > 0', cols: [['kr', 'KR'], ['krYds', 'KR YDS'], ['pr', 'PR'], ['prYds', 'PR YDS']] },
};

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const cat = CATS[sp.cat ?? ''] ? sp.cat! : 'passing';
  const def = CATS[cat];
  const sql = getSql();
  const [teams, teamList, confs, seasons] = await Promise.all([getTeamMap(), getTeams(), getConferences(), getSeasons()]);
  const team = teamList.find((t) => t.slug === sp.team);
  const conf = confs.find((c) => c.slug === sp.conf);
  const rows = await sql`
    select ps.*, p.first_name, p.last_name, p.position from player_season_stats ps
    join players p on p.id = ps.player_id
    left join team_seasons ts on ts.season_id = ps.season_id and ts.team_id = ps.team_id
    where ps.season_id = ${season.id} and (${sql.unsafe(def.filter)})
      ${team ? sql`and ps.team_id = ${team.id}` : sql``} ${conf ? sql`and ts.conference_id = ${conf.id}` : sql``}
      ${sp.pos ? sql`and p.position = ${sp.pos}` : sql``}
    order by ${sql.unsafe(def.order)} desc limit 50`;
  const v = (r: any, k: string) => {
    switch (k) {
      case 'pct': return r.passAtt ? ((r.passCmp / r.passAtt) * 100).toFixed(1) : '—';
      case 'ypc': return r.rushAtt ? (r.rushYds / r.rushAtt).toFixed(1) : '—';
      case 'ypr': return r.rec ? (r.recYds / r.rec).toFixed(1) : '—';
      case 'ypg': return (Number(r[cat === 'passing' ? 'passYds' : cat === 'rushing' ? 'rushYds' : 'recYds']) / r.games).toFixed(1);
      case 'fgPct': return r.fga ? ((r.fgm / r.fga) * 100).toFixed(1) : '—';
      case 'pts': return r.fgm * 3 + r.xpm;
      default: return Number(r[k]);
    }
  };
  const teamStats = await sql`select * from team_season_stats where season_id = ${season.id} order by points::float / games desc`;
  const base = { season: season.id, team: sp.team ?? '', conf: sp.conf ?? '', pos: sp.pos ?? '' };
  return (
    <div>
      <PageHeader title="Statistics" eyebrow={<span className="flex items-center gap-2">{season.name}<DemoBadge show={season.isDemo} /></span>} actions={<Link href="/stats/records" className="btn-ghost">Record Book →</Link>}>
        Official games only — exhibitions and lore never count.
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-1">
        {Object.entries(CATS).map(([k, c]) => <Link key={k} href={`/stats?${new URLSearchParams({ ...base, cat: k })}`} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${cat === k ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'}`}>{c.label}</Link>)}
        <Link href={`/stats?${new URLSearchParams({ ...base, cat: 'team' })}`} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${sp.cat === 'team' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'}`}>Team</Link>
      </div>
      <FilterBar>
        <input type="hidden" name="cat" value={sp.cat ?? cat} />
        <Select name="season" value={season.id} label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} />
        <Select name="conf" value={sp.conf} label="Conference" options={[{ value: '', label: 'All' }, ...confs.map((c) => ({ value: c.slug, label: c.shortName }))]} />
        <Select name="team" value={sp.team} label="Team" options={[{ value: '', label: 'All' }, ...teamList.map((t) => ({ value: t.slug, label: t.school }))]} />
        <Select name="pos" value={sp.pos} label="Position" options={[{ value: '', label: 'All' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} />
      </FilterBar>
      {sp.cat === 'team' ? (
        <Card pad={false} title="Team Leaders">
          <div className="overflow-x-auto"><table className="table tabular">
            <thead><tr><th>Team</th><th className="text-right">G</th><th className="text-right">PTS/G</th><th className="text-right">OPP/G</th><th className="text-right">YDS/G</th><th className="text-right">PASS/G</th><th className="text-right">RUSH/G</th><th className="text-right">YDS ALLOWED/G</th><th className="text-right">TO MARGIN</th></tr></thead>
            <tbody>{teamStats.filter((t) => !conf || teams.get(t.teamId)?.conferenceId === conf.id).map((t) => { const tm = teams.get(t.teamId); return tm ? (
              <tr key={t.teamId}><td><TeamLink team={tm} size={20} /></td><td className="text-right">{t.games}</td><td className="text-right font-bold">{(t.points / t.games).toFixed(1)}</td><td className="text-right">{(t.pointsAllowed / t.games).toFixed(1)}</td><td className="text-right">{(t.totalYards / t.games).toFixed(1)}</td><td className="text-right">{(t.passYards / t.games).toFixed(1)}</td><td className="text-right">{(t.rushYards / t.games).toFixed(1)}</td><td className="text-right">{(t.yardsAllowed / t.games).toFixed(1)}</td><td className="text-right">{t.takeaways - t.turnovers > 0 ? '+' : ''}{t.takeaways - t.turnovers}</td></tr>
            ) : null; })}</tbody>
          </table></div>
        </Card>
      ) : (
        <Card pad={false} title={`${def.label} Leaders`}>
          {rows.length ? (
            <div className="overflow-x-auto"><table className="table tabular">
              <thead><tr><th>#</th><th>Player</th><th>Team</th><th className="text-right">G</th>{def.cols.map(([k, l]) => <th key={k} className="text-right">{l}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => { const t = teams.get(r.teamId); return (
                <tr key={`${r.playerId}-${r.teamId}`}><td className="text-muted">{i + 1}</td><td><Link href={`/players/${r.playerId}`} className="font-semibold hover:text-accent">{r.firstName} {r.lastName}</Link> <span className="text-xs text-muted">{r.position}</span></td><td>{t ? <TeamLink team={t} size={18} short /> : '—'}</td><td className="text-right">{r.games}</td>{def.cols.map(([k]) => <td key={k} className={`text-right ${k === CATS[cat].cols[0][0] ? '' : ''}`}>{v(r, k)}</td>)}</tr>
              ); })}</tbody>
            </table></div>
          ) : <div className="card-pad"><EmptyState title="No qualifying players" /></div>}
        </Card>
      )}
    </div>
  );
}
