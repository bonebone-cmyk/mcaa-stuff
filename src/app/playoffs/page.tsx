import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, FilterBar, PageHeader, Select, TeamLogo } from '@/components/ui';
import { getLatestPoll, getSeasons, getTeamMap, resolveSeason, type TeamRow } from '@/lib/queries';
import { buildBracket, bracketRounds, resolveMatchup, roundName, selectField, type Seed } from '@/lib/playoffs';

export const metadata = { title: 'Playoffs' };

export default async function PlayoffsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const sp = await searchParams;
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const sql = getSql();
  const [teams, seasons] = await Promise.all([getTeamMap(), getSeasons()]);
  const [bracket] = await sql`select * from playoff_brackets where season_id = ${season.id}`;
  let seeds: Seed[] = [];
  let projected = false;
  const size = bracket?.size ?? season.playoffSize;
  if (bracket) {
    seeds = (await sql`select * from playoff_seeds where bracket_id = ${bracket.id} order by seed`) as any;
  } else {
    projected = true;
    let poll = await getLatestPoll(season.id, 'playoff');
    if (!poll.rows.length) poll = await getLatestPoll(season.id, 'computer');
    const leaders = await sql`
      select distinct on (ts.conference_id) ts.conference_id, ts.team_id from team_seasons ts
      join team_records r on r.team_id = ts.team_id and r.season_id = ts.season_id
      join conferences c on c.id = ts.conference_id and c.slug <> 'independent'
      where ts.season_id = ${season.id} order by ts.conference_id, (r.conf_wins::float / greatest(1, r.conf_wins + r.conf_losses)) desc, r.wins desc`;
    if (poll.rows.length) seeds = selectField(poll.rows.map((r) => r.teamId), leaders.map((l) => ({ teamId: l.teamId, conferenceId: l.conferenceId })), size, season.playoffAutoBids);
  }
  const games = await sql`select * from games where season_id = ${season.id} and game_type = 'playoff'`;
  const winners = new Map<string, string>(games.filter((g) => g.status === 'final').map((g) => [`${g.playoffRound}-${g.bracketSlot}`, g.winnerTeamId]));
  const seedMap = new Map(seeds.map((s) => [s.seed, s.teamId]));
  const seedOf = new Map(seeds.map((s) => [s.teamId, s.seed]));
  const matchups = buildBracket(size);
  const rounds = bracketRounds(size);
  const history = await sql`select c.team_id, c.game_id, s.year, s.is_demo, s.name from championships c join seasons s on s.id = c.season_id where c.kind = 'national' order by s.year desc`;

  const Slot = ({ teamId, score, won }: { teamId: string | null; score?: number | null; won?: boolean }) => {
    const t = teamId ? teams.get(teamId) : null;
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${won === false ? 'opacity-50' : ''}`}>
        {t ? <><span className="tabular w-4 text-[10px] font-bold text-muted">{seedOf.get(t.id)}</span><TeamLogo team={t} size={20} /><span className="flex-1 truncate font-semibold">{t.school}</span>{score != null && <span className="tabular font-bold">{score}</span>}</> : <span className="text-muted">TBD</span>}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="College Football Playoff" eyebrow={<span className="flex items-center gap-2">{season.name}<DemoBadge show={season.isDemo} /></span>}>
        {size}-team field · {season.playoffAutoBids} automatic bids for the highest-ranked conference champions · {projected ? 'projected field (bracket not yet set)' : 'official bracket'}
      </PageHeader>
      <FilterBar><Select name="season" value={season.id} label="Season" options={seasons.map((s) => ({ value: s.id, label: s.name }))} /></FilterBar>
      {!seeds.length ? <EmptyState title="No rankings yet">The projected field appears once rankings are published.</EmptyState> : (
        <>
          <div className="scrollbar-none -mx-4 mb-8 overflow-x-auto px-4">
            <div className="flex min-w-max gap-6">
              {Array.from({ length: rounds }, (_, r) => r + 1).map((round) => (
                <div key={round} className="flex w-64 flex-col justify-around gap-4">
                  <div className="eyebrow text-center">{roundName(size, round)}</div>
                  {matchups.filter((m) => m.round === round).map((m) => {
                    const g = games.find((x) => x.playoffRound === m.round && x.bracketSlot === m.slot);
                    const [a, b] = resolveMatchup(m, seedMap, winners);
                    const sc = (id: string | null) => (g?.status === 'final' && id ? (g.homeTeamId === id ? g.homeScore : g.awayScore) : null);
                    const won = (id: string | null) => (g?.status === 'final' && id ? g.winnerTeamId === id : undefined);
                    const inner = (
                      <div className={`card overflow-hidden ${round === rounds ? 'ring-2 ring-gold/60' : ''}`}>
                        <Slot teamId={a} score={sc(a)} won={won(a)} />
                        <div className="border-t border-line" />
                        <Slot teamId={b} score={sc(b)} won={won(b)} />
                        {g?.siteName && <div className="border-t border-line bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{g.siteName}</div>}
                      </div>
                    );
                    return g ? <Link key={m.slot} href={`/games/${g.id}`} className="block transition hover:-translate-y-0.5">{inner}</Link> : <div key={m.slot}>{inner}</div>;
                  })}
                </div>
              ))}
              <div className="flex w-48 flex-col justify-center">
                <div className="eyebrow mb-2 text-center">Champion</div>
                {season.championTeamId ? (
                  <div className="card card-pad flex flex-col items-center gap-2 text-center ring-2 ring-gold">
                    <TeamLogo team={teams.get(season.championTeamId)!} size={64} />
                    <div className="font-display text-lg font-black uppercase">{teams.get(season.championTeamId)?.school}</div>
                    <Badge tone="gold">National Champions</Badge>
                  </div>
                ) : <div className="card card-pad text-center text-sm text-muted">To be decided</div>}
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={projected ? 'Projected Field' : 'Seeds'} pad={false}>
              <table className="table">
                <thead><tr><th>Seed</th><th>Team</th><th>Bid</th></tr></thead>
                <tbody>{seeds.map((s) => { const t = teams.get(s.teamId) as TeamRow; return t ? <tr key={s.seed}><td className="font-display text-lg font-bold">{s.seed}</td><td><Link href={`/teams/${t.slug}`} className="flex items-center gap-2 font-semibold hover:text-accent"><TeamLogo team={t} size={22} />{t.school}</Link></td><td><Badge tone={s.bidType === 'auto' ? 'accent' : 'default'}>{s.bidType === 'auto' ? 'Automatic' : 'At-large'}</Badge></td></tr> : null; })}</tbody>
              </table>
            </Card>
            <Card title="National Championship History">
              {history.length ? <ul className="space-y-2">{history.map((h, i) => { const t = teams.get(h.teamId); return t ? <li key={i} className="flex items-center gap-3"><span className="font-display text-xl font-bold">{h.year}</span><TeamLogo team={t} size={26} /><span className="flex-1 font-semibold">{t.school}</span><DemoBadge show={h.isDemo} />{h.gameId && <Link href={`/games/${h.gameId}`} className="text-xs text-accent">Game →</Link>}</li> : null; })}</ul> : <p className="text-sm text-muted">No national champions crowned yet.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
