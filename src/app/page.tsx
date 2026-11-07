import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, Movement, Stars, TeamLink, TeamLogo } from '@/components/ui';
import { GameCard, kickoffLabel } from '@/components/games/game-card';
import { getConferenceStandings, getCurrentSeason, getGames, getLatestPoll, getRankMap, getTeamMap, getTeamRecords, PHASE_LABEL, recordStr, weekLabel } from '@/lib/queries';
import { ARTICLE_CATEGORIES } from '@/lib/services/articles';

export default async function HomePage() {
  const season = await getCurrentSeason();
  if (!season) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <EmptyState title="The universe is empty">Run the database migrations and seed (<code>npm run db:migrate && npm run db:seed</code>), or sign in as the commissioner to create the first season.</EmptyState>
      </div>
    );
  }
  const sql = getSql();
  const [teams, ranks, records] = await Promise.all([getTeamMap(), getRankMap(season.id), getTeamRecords(season.id)]);
  const week = season.currentWeek;
  const [thisWeek, lastFinal] = await Promise.all([
    getGames({ seasonId: season.id, week }),
    sql`select max(week) as w from games where season_id = ${season.id} and status = 'final' and game_type <> 'exhibition'`,
  ]);
  const lastWeek = lastFinal[0]?.w as number | null;
  const finals = lastWeek != null ? (await getGames({ seasonId: season.id, week: lastWeek, status: 'final' })).filter((g) => g.gameType !== 'exhibition') : [];
  const rankScore = (g: { homeTeamId: string; awayTeamId: string }) => Math.min(ranks.get(g.homeTeamId) ?? 99, ranks.get(g.awayTeamId) ?? 99);
  const upcoming = thisWeek.filter((g) => g.status === 'scheduled' && g.gameType !== 'exhibition').sort((a, b) => rankScore(a) - rankScore(b));
  const gotw = thisWeek.find((g) => g.isGameOfWeek && g.status === 'scheduled') ?? upcoming[0] ?? finals.find((g) => g.isGameOfWeek) ?? finals[0];
  const topFinals = [...finals].sort((a, b) => rankScore(a) - rankScore(b)).slice(0, 8);

  const [poll, playoffPoll, articles, breaking, commits, featured] = await Promise.all([
    getLatestPoll(season.id, 'media'),
    getLatestPoll(season.id, 'playoff').then(async (p) => (p.rows.length ? p : getLatestPoll(season.id, 'computer'))),
    sql`select id, slug, headline, subheadline, category, cover_image_url, published_at, is_demo, is_official, team_id from articles where status = 'published' order by published_at desc limit 5`,
    sql`select slug, headline from articles where status = 'published' and is_breaking order by published_at desc limit 1`,
    sql`select c.event, c.created_at, c.team_id, c.previous_team_id, r.id as recruit_id, r.first_name, r.last_name, r.position, r.stars, r.national_rank, r.is_transfer
        from commitments c join recruits r on r.id = c.recruit_id where c.season_id = ${season.id} order by c.created_at desc, r.national_rank limit 6`,
    lastWeek != null ? sql`
      select p.id, p.first_name, p.last_name, p.position, p.team_id, s.*,
        (s.pass_yds / 25.0 + s.pass_td * 4 - s.pass_int * 2 + s.rush_yds / 10.0 + s.rush_td * 6 + s.rec_yds / 10.0 + s.rec_td * 6 + s.tackles * 0.8 + s.sacks * 4 + s.def_int * 6) as score
      from player_game_stats s join games g on g.id = s.game_id join players p on p.id = s.player_id
      where g.season_id = ${season.id} and g.week = ${lastWeek} and g.game_type <> 'exhibition'
      order by score desc limit 1` : Promise.resolve([]),
  ]);
  const confs = await sql`select id, slug, short_name from conferences where slug in ('sec', 'big-ten') order by slug desc`;
  const standings = await Promise.all(confs.map(async (c) => ({ conf: c, rows: (await getConferenceStandings(season.id, c.id)).slice(0, 6) })));
  const lead = articles[0];

  return (
    <div className="space-y-6">
      {breaking[0] && (
        <Link href={`/news/${breaking[0].slug}`} className="flex items-center gap-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-card">
          <span className="animate-live rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest">Breaking</span>
          <span className="truncate">{breaking[0].headline}</span>
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <span>{season.name}</span><span>·</span><span>{PHASE_LABEL[season.phase]}</span><span>·</span><span>{weekLabel(season, week)}</span>
        <DemoBadge show={season.isDemo} />
      </div>

      {/* Scoreboard strip */}
      {upcoming.length > 0 && (
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {upcoming.slice(0, 12).map((g) => (
            <div key={g.id} className="w-44 shrink-0"><GameCard game={g} teams={teams} ranks={ranks} compact /></div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {gotw && <GameOfTheWeek game={gotw} teams={teams} ranks={ranks} records={records} />}

          {lead && (
            <Link href={`/news/${lead.slug}`} className="card group block overflow-hidden">
              {lead.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.coverImageUrl} alt="" className="h-56 w-full object-cover transition group-hover:scale-[1.01]" />
              )}
              <div className="card-pad">
                <div className="mb-2 flex items-center gap-2"><Badge tone="accent">{ARTICLE_CATEGORIES[lead.category]}</Badge>{lead.isOfficial && <Badge>Official</Badge>}<DemoBadge show={lead.isDemo} /></div>
                <h2 className="font-display text-2xl font-extrabold leading-tight group-hover:text-accent sm:text-3xl">{lead.headline}</h2>
                {lead.subheadline && <p className="mt-1 text-muted">{lead.subheadline}</p>}
              </div>
            </Link>
          )}

          <Card title={lastWeek != null ? `Final Scores · ${weekLabel(season, lastWeek)}` : 'Final Scores'} action={<Link href={`/scores?week=${lastWeek ?? week}`} className="text-xs font-semibold text-accent">All scores →</Link>}>
            {topFinals.length ? (
              <div className="grid gap-3 sm:grid-cols-2">{topFinals.map((g) => <GameCard key={g.id} game={g} teams={teams} ranks={ranks} />)}</div>
            ) : <EmptyState title="No games played yet" />}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Recruiting Wire" action={<Link href="/recruiting?tab=commitments" className="text-xs font-semibold text-accent">More →</Link>}>
              {commits.length ? (
                <ul className="space-y-3">
                  {commits.map((c, i) => {
                    const t = teams.get(c.teamId);
                    return (
                      <li key={i} className="flex items-center gap-3">
                        {t && <TeamLogo team={t} size={30} />}
                        <div className="min-w-0 text-sm">
                          <Link href={`/recruiting/${c.recruitId}`} className="font-semibold hover:text-accent">{c.firstName} {c.lastName}</Link>
                          <span className="text-muted"> · {c.position} · #{c.nationalRank ?? '—'}</span>
                          <div className="flex items-center gap-2 text-xs text-muted"><Stars n={c.stars} />
                            <span className="font-semibold uppercase text-fg">{c.event === 'flip' ? `flips to ${t?.abbreviation}` : c.event === 'decommit' ? `decommits from ${t?.abbreviation}` : c.event === 'signed' ? `signs with ${t?.abbreviation}` : `commits to ${t?.abbreviation}`}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title="Quiet on the trail" />}
            </Card>
            <Card title="Featured Player">
              {featured[0] ? (() => {
                const f = featured[0];
                const t = teams.get(f.teamId);
                const line = [f.passYds ? `${f.passCmp}/${f.passAtt}, ${f.passYds} pass yds, ${f.passTd} TD` : null, f.rushYds ? `${f.rushAtt} car, ${f.rushYds} rush yds, ${f.rushTd} TD` : null, f.recYds ? `${f.rec} rec, ${f.recYds} yds, ${f.recTd} TD` : null, f.tackles ? `${f.tackles} tkl, ${f.sacks} sk, ${f.defInt} INT` : null].filter(Boolean);
                return (
                  <div className="flex items-start gap-4" style={{ ['--team' as string]: t?.primaryColor }}>
                    {t && <TeamLogo team={t} size={64} />}
                    <div>
                      <div className="eyebrow">Player of the Week · {f.position}</div>
                      <Link href={`/players/${f.id}`} className="font-display text-2xl font-extrabold hover:text-accent">{f.firstName} {f.lastName}</Link>
                      <div className="text-sm text-muted">{t?.school}</div>
                      <ul className="mt-2 space-y-0.5 text-sm">{line.map((l) => <li key={l}>{l}</li>)}</ul>
                    </div>
                  </div>
                );
              })() : <EmptyState title="Season hasn't kicked off" />}
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {standings.map(({ conf, rows }) => (
              <Card key={conf.id} title={`${conf.shortName} Standings`} pad={false} action={<Link href={`/conferences/${conf.slug}`} className="text-xs font-semibold text-accent">Full →</Link>}>
                <table className="table">
                  <thead><tr><th>Team</th><th className="text-right">Conf</th><th className="text-right">Overall</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const t = teams.get(r.teamId)!;
                      return (
                        <tr key={r.teamId}>
                          <td><TeamLink team={t} rank={ranks.get(t.id)} size={20} /></td>
                          <td className="tabular text-right">{r.record.confWins}-{r.record.confLosses}</td>
                          <td className="tabular text-right">{r.record.wins}-{r.record.losses}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>

          <Card title="Latest News & Lore" action={<Link href="/news" className="text-xs font-semibold text-accent">All stories →</Link>}>
            <ul className="divide-y divide-line">
              {articles.slice(1).map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/news/${a.slug}`} className="group block">
                    <div className="mb-1 flex items-center gap-2"><span className="eyebrow">{ARTICLE_CATEGORIES[a.category]}</span><DemoBadge show={a.isDemo} /></div>
                    <div className="font-semibold group-hover:text-accent">{a.headline}</div>
                  </Link>
                </li>
              ))}
              {articles.length <= 1 && <li className="text-sm text-muted">No more stories yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={`Top 25${poll.week != null ? ` · ${weekLabel(season, poll.week)}` : ''}`} pad={false} action={<Link href="/rankings" className="text-xs font-semibold text-accent">Polls →</Link>}>
            {poll.rows.length ? (
              <ol className="divide-y divide-line/60">
                {poll.rows.map((r) => {
                  const t = teams.get(r.teamId);
                  if (!t) return null;
                  return (
                    <li key={r.rank} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="tabular w-5 text-right font-display text-base font-bold">{r.rank}</span>
                      <TeamLink team={t} size={22} className="flex-1" />
                      <span className="tabular text-xs text-muted">{r.record}</span>
                      <span className="w-8 text-right"><Movement current={r.rank} previous={r.previousRank} /></span>
                    </li>
                  );
                })}
              </ol>
            ) : <div className="card-pad"><EmptyState title="No poll yet" /></div>}
          </Card>

          <Card title="Playoff Race" pad={false} action={<Link href="/playoffs" className="text-xs font-semibold text-accent">Bracket →</Link>}>
            {playoffPoll.rows.length ? (
              <ol>
                {playoffPoll.rows.slice(0, season.playoffSize + 4).map((r) => {
                  const t = teams.get(r.teamId);
                  if (!t) return null;
                  const out = r.rank > season.playoffSize;
                  return (
                    <li key={r.rank} className={`flex items-center gap-3 px-4 py-1.5 text-sm ${r.rank === season.playoffSize ? 'border-b-2 border-dashed border-accent' : ''} ${out ? 'opacity-55' : ''}`}>
                      <span className="tabular w-5 text-right font-bold">{r.rank}</span>
                      <TeamLink team={t} size={20} className="flex-1" />
                      <span className="text-xs text-muted">{r.record}</span>
                    </li>
                  );
                })}
              </ol>
            ) : <div className="card-pad text-sm text-muted">Playoff rankings begin later in the season.</div>}
            <div className="border-t border-line px-4 py-2 text-[11px] text-muted">{season.playoffSize}-team field · line marks the cut</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GameOfTheWeek({ game, teams, ranks, records }: { game: Awaited<ReturnType<typeof getGames>>[number]; teams: Awaited<ReturnType<typeof getTeamMap>>; ranks: Map<string, number>; records: Map<string, any> }) {
  const home = teams.get(game.homeTeamId)!;
  const away = teams.get(game.awayTeamId)!;
  const final = game.status === 'final';
  const side = (t: typeof home, score: number | null) => (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <TeamLogo team={t} size={88} className="drop-shadow-xl" />
      <div>
        <div className="text-xs font-bold text-white/70">{ranks.get(t.id) ? `No. ${ranks.get(t.id)}` : ' '}</div>
        <div className="font-display text-xl font-extrabold uppercase leading-tight text-white sm:text-2xl">{t.school}</div>
        <div className="text-xs text-white/70">{recordStr(records.get(t.id))}</div>
      </div>
      {final && <div className="tabular font-display text-5xl font-black text-white">{score}</div>}
    </div>
  );
  return (
    <Link href={`/games/${game.id}`} className="group relative block overflow-hidden rounded-2xl shadow-card"
      style={{ background: `linear-gradient(120deg, ${away.primaryColor} 0%, #0b0b0d 48%, #0b0b0d 52%, ${home.primaryColor} 100%)` }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.12),transparent_60%)]" />
      <div className="relative p-5 sm:p-7">
        <div className="mb-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
          <span className="rounded bg-accent px-2 py-1 text-white">Game of the Week</span>
          <span>{final ? `Final${game.overtimes ? ' · OT' : ''}` : `${kickoffLabel(game.kickoffAt)}${game.networkShort ? ` · ${game.networkShort}` : ''}`}</span>
        </div>
        <div className="flex items-center gap-4">
          {side(away, game.awayScore)}
          <div className="font-display text-2xl font-black text-white/60">{final ? '–' : game.neutralSite ? 'VS' : '@'}</div>
          {side(home, game.homeScore)}
        </div>
        <div className="mt-4 text-center text-xs font-semibold text-white/80">
          {game.rivalryName ? `${game.rivalryName} · ` : ''}{game.siteName ?? (game.neutralSite ? 'Neutral site' : `${home.school} home game`)}
          <span className="ml-2 underline-offset-2 group-hover:underline">{final ? 'Box score & play-by-play →' : 'Preview →'}</span>
        </div>
      </div>
    </Link>
  );
}
