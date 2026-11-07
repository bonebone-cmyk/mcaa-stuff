import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, RatingPill, Stars, StatTile, Tabs, TeamLogo } from '@/components/ui';
import { GameCard } from '@/components/games/game-card';
import { ActionForm, Submit } from '@/components/action-form';
import { getActor } from '@/lib/auth/session';
import { canManageTeam, canPublishLore } from '@/lib/auth/permissions';
import { getClassRankings, getCurrentSeason, getGames, getRankMap, getTeamMap, getTeamRecords, recordStr } from '@/lib/queries';
import { classLabel, formatHeight, POSITIONS, SCHEME_LABELS, STARTERS } from '@/lib/players/positions';
import { ARTICLE_CATEGORIES } from '@/lib/services/articles';
import { addTimelineAction, followAction } from '@/app/my-team/actions';

type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const [t] = await getSql()`select school, mascot from teams where slug = ${slug}`.catch(() => []);
  return { title: t ? `${t.school} ${t.mascot}` : 'Team' };
}

export default async function TeamPage({ params, searchParams }: P) {
  const { slug } = await params;
  const { tab = 'overview' } = await searchParams;
  const sql = getSql();
  const [team] = await sql`select t.*, c.name as conference_name, c.short_name as conference_short, c.slug as conference_slug
                           from teams t left join conferences c on c.id = t.conference_id where t.slug = ${slug}`;
  if (!team) notFound();
  const [season, teams, actor, settingsRows] = await Promise.all([getCurrentSeason(), getTeamMap(), getActor(), sql`select allow_assistant_coaches, allow_owner_lore from universe_settings where id = 1`]);
  const ctx = { allowAssistantCoaches: settingsRows[0]?.allowAssistantCoaches ?? true, allowOwnerLore: settingsRows[0]?.allowOwnerLore ?? true };
  const [ranks, records] = season ? await Promise.all([getRankMap(season.id), getTeamRecords(season.id)]) : [new Map<string, number>(), new Map()];
  const rec = records.get(team.id);
  const staff = await sql`select s.role, p.display_name, p.id from team_staff s join profiles p on p.id = s.user_id where s.team_id = ${team.id} order by s.role`;
  const following = actor ? (await sql`select 1 from follows where user_id = ${actor.userId} and team_id = ${team.id}`).length > 0 : false;
  const canManage = canManageTeam(actor, team.id, ctx);
  const base = `/teams/${slug}`;
  const champs = await sql`select kind, count(*)::int as n from championships where team_id = ${team.id} group by kind`;
  const natl = champs.find((c) => c.kind === 'national')?.n ?? 0;
  const confTitles = champs.find((c) => c.kind === 'conference')?.n ?? 0;

  return (
    <div style={{ ['--team' as string]: team.primaryColor }}>
      {/* Team header */}
      <div className="relative mb-6 overflow-hidden rounded-2xl shadow-card" style={{ background: `linear-gradient(120deg, ${team.primaryColor} 0%, ${team.primaryColor}cc 45%, #0b0b0d 100%)` }}>
        <div className="absolute -right-10 -top-10 opacity-15"><TeamLogo team={team} size={280} /></div>
        <div className="relative flex flex-col gap-4 p-5 text-white sm:flex-row sm:items-center sm:p-7">
          <div className="grid h-28 w-28 shrink-0 place-items-center rounded-2xl bg-white/95 p-2 shadow-xl"><TeamLogo team={team} size={96} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
              {team.conferenceShort ?? 'Independent'}{ranks.get(team.id) ? ` · No. ${ranks.get(team.id)}` : ''}{team.isCustom ? ' · Custom program' : ''}
            </div>
            <h1 className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">{team.school}</h1>
            <div className="text-lg font-semibold text-white/85">{team.mascot}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
              <span className="font-bold text-white">{recordStr(rec)}{rec ? ` (${rec.confWins}-${rec.confLosses} conf)` : ''}</span>
              <span>{team.stadium ?? 'Stadium TBD'}{team.stadiumCapacity ? ` · ${Number(team.stadiumCapacity).toLocaleString()}` : ''}</span>
              <span>{[team.city, team.state].filter(Boolean).join(', ')}</span>
              {natl > 0 && <span>🏆 {natl} national title{natl > 1 ? 's' : ''}</span>}
              {confTitles > 0 && <span>{confTitles} conference title{confTitles > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {actor && (
              <ActionForm action={followAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <Submit className="btn !bg-white/15 !text-white hover:!bg-white/25">{following ? '★ Following' : '☆ Follow'}</Submit>
              </ActionForm>
            )}
            {canManage && <Link href="/my-team" className="btn !bg-white !text-black">Manage</Link>}
          </div>
        </div>
      </div>

      <Tabs active={tab} tabs={['overview', 'roster', 'depth', 'schedule', 'recruiting', 'history', 'rivalries', 'news'].map((k) => ({ key: k, label: k === 'depth' ? 'Depth Chart' : k[0].toUpperCase() + k.slice(1), href: `${base}?tab=${k}` }))} />

      {tab === 'overview' && <Overview team={team} season={season} teams={teams} ranks={ranks} records={records} staff={staff} />}
      {tab === 'roster' && <Roster teamId={team.id} />}
      {tab === 'depth' && <Depth teamId={team.id} />}
      {tab === 'schedule' && season && <TeamSchedule teamId={team.id} seasonId={season.id} teams={teams} ranks={ranks} />}
      {tab === 'recruiting' && season && <TeamRecruiting teamId={team.id} seasonId={season.id} teams={teams} />}
      {tab === 'history' && <History team={team} canAddLore={canPublishLore(actor, team.id, ctx)} isCommissioner={actor?.role === 'commissioner'} />}
      {tab === 'rivalries' && <Rivalries teamId={team.id} teams={teams} />}
      {tab === 'news' && <TeamNews teamId={team.id} />}
    </div>
  );
}

async function Overview({ team, season, teams, ranks, records, staff }: any) {
  const sql = getSql();
  const games = season ? await getGames({ seasonId: season.id, teamId: team.id }) : [];
  const next = games.find((g) => g.status === 'scheduled');
  const recent = games.filter((g) => g.status === 'final').slice(-5).reverse();
  const stars = await sql`select id, first_name, last_name, position, overall, jersey, seasons_played, redshirt_used from players where team_id = ${team.id} and status = 'active' order by overall desc limit 8`;
  const ts = season ? (await sql`select * from team_season_stats where season_id = ${season.id} and team_id = ${team.id}`)[0] : null;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Overall" value={team.overallRating} />
          <StatTile label="Offense" value={team.offenseRating} sub={SCHEME_LABELS[team.offenseScheme]} />
          <StatTile label="Defense" value={team.defenseRating} sub={SCHEME_LABELS[team.defenseScheme]} />
          <StatTile label="Prestige" value={team.prestige} sub={`Home field ${team.homeFieldRating}`} />
        </div>
        {ts && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Points / game" value={(ts.points / ts.games).toFixed(1)} />
            <StatTile label="Allowed / game" value={(ts.pointsAllowed / ts.games).toFixed(1)} />
            <StatTile label="Yards / game" value={(ts.totalYards / ts.games).toFixed(0)} />
            <StatTile label="Turnover margin" value={(ts.takeaways - ts.turnovers > 0 ? '+' : '') + (ts.takeaways - ts.turnovers)} />
          </div>
        )}
        {next && (
          <Card title="Up Next"><GameCard game={next} teams={teams} ranks={ranks} /></Card>
        )}
        <Card title="Recent Results">
          {recent.length ? <div className="grid gap-3 sm:grid-cols-2">{recent.map((g) => <GameCard key={g.id} game={g} teams={teams} ranks={ranks} compact />)}</div> : <EmptyState title="No games played yet" />}
        </Card>
        <Card title="Top Players" pad={false}>
          <table className="table">
            <thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Class</th><th className="text-right">OVR</th></tr></thead>
            <tbody>{stars.map((p) => (
              <tr key={p.id}><td className="tabular text-muted">{p.jersey}</td><td><Link href={`/players/${p.id}`} className="font-semibold hover:text-accent">{p.firstName} {p.lastName}</Link></td><td>{p.position}</td><td className="text-muted">{classLabel(p.seasonsPlayed, p.redshirtUsed)}</td><td className="text-right"><RatingPill value={p.overall} /></td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Program">
          <dl className="space-y-2 text-sm">
            {[['Head coach', `${team.coachName ?? 'Vacant'} (${team.coachRating})`], ['Offense', SCHEME_LABELS[team.offenseScheme]], ['Defense', SCHEME_LABELS[team.defenseScheme]],
              ['Conference', team.conferenceName ?? 'Independent'], ['Stadium', team.stadium ?? '—'], ['Capacity', team.stadiumCapacity ? Number(team.stadiumCapacity).toLocaleString() : '—'],
              ['Colors', null]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">
                {k === 'Colors' ? <span className="inline-flex gap-1"><span className="h-4 w-8 rounded" style={{ background: team.primaryColor }} /><span className="h-4 w-8 rounded border border-line" style={{ background: team.secondaryColor }} /></span> : v}
              </dd></div>
            ))}
          </dl>
        </Card>
        <Card title="Coaching Staff (Owners)">
          {staff.length ? (
            <ul className="space-y-2 text-sm">{staff.map((s: any) => <li key={s.id} className="flex justify-between"><span className="font-semibold">{s.displayName}</span><Badge tone={s.role === 'owner' ? 'accent' : 'default'}>{s.role === 'owner' ? 'Head coach' : 'Assistant'}</Badge></li>)}</ul>
          ) : <p className="text-sm text-muted">Computer-controlled program. The commissioner can assign an owner.</p>}
        </Card>
        <Card title="Season Record">
          {(() => {
            const r = records.get(team.id);
            if (!r) return <p className="text-sm text-muted">No games played.</p>;
            return (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[['Overall', `${r.wins}-${r.losses}`], ['Conference', `${r.confWins}-${r.confLosses}`], ['Home', `${r.homeWins}-${r.homeLosses}`], ['Away', `${r.awayWins}-${r.awayLosses}`], ['Points for', r.pointsFor], ['Points against', r.pointsAgainst]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-2 p-2"><dt className="eyebrow">{k}</dt><dd className="tabular font-display text-xl font-bold">{v}</dd></div>
                ))}
              </dl>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}

async function Roster({ teamId }: { teamId: string }) {
  const players = await getSql()`select * from players where team_id = ${teamId} and status = 'active' order by array_position(${POSITIONS as unknown as string[]}::text[], position), overall desc`;
  if (!players.length) return <EmptyState title="No players on the roster" />;
  return (
    <Card pad={false} title={`Roster · ${players.length} players`}>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Class</th><th>Ht/Wt</th><th>Hometown</th><th>Stars</th><th className="text-right">OVR</th><th className="text-right">POT</th><th>Status</th></tr></thead>
          <tbody>{players.map((p) => (
            <tr key={p.id}>
              <td className="tabular text-muted">{p.jersey}</td>
              <td><Link href={`/players/${p.id}`} className="font-semibold hover:text-accent">{p.firstName} {p.lastName}</Link> <DemoBadge show={p.isDemo} /></td>
              <td>{p.position}</td><td>{classLabel(p.seasonsPlayed, p.redshirtUsed)}</td>
              <td className="tabular text-muted">{formatHeight(p.heightIn)} / {p.weight}</td><td className="text-muted">{p.hometown}</td>
              <td><Stars n={p.stars} /></td><td className="text-right"><RatingPill value={p.overall} /></td><td className="tabular text-right text-muted">{p.potential}</td>
              <td>{p.injuryWeeks > 0 ? <Badge tone="loss">{p.injuryType} · {p.injuryWeeks}w</Badge> : <span className="text-xs text-win">Healthy</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}

async function Depth({ teamId }: { teamId: string }) {
  const rows = await getSql()`select d.slot, d.depth, p.id, p.first_name, p.last_name, p.overall, p.injury_weeks from depth_chart d join players p on p.id = d.player_id where d.team_id = ${teamId} order by d.slot, d.depth`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {POSITIONS.map((pos) => {
        const list = rows.filter((r) => r.slot === pos);
        return (
          <Card key={pos} title={`${pos} · ${STARTERS[pos]} starter${STARTERS[pos] > 1 ? 's' : ''}`}>
            <ol className="space-y-1 text-sm">
              {list.map((r) => (
                <li key={r.id} className={`flex items-center justify-between gap-2 ${r.depth <= STARTERS[pos] ? 'font-semibold' : 'text-muted'}`}>
                  <span><span className="tabular mr-2 text-xs text-muted">{r.depth}</span><Link href={`/players/${r.id}`} className="hover:text-accent">{r.firstName} {r.lastName}</Link>{r.injuryWeeks > 0 && <span className="ml-1 text-xs text-loss">(inj)</span>}</span>
                  <RatingPill value={r.overall} />
                </li>
              ))}
              {!list.length && <li className="text-muted">Empty</li>}
            </ol>
          </Card>
        );
      })}
    </div>
  );
}

async function TeamSchedule({ teamId, seasonId, teams, ranks }: any) {
  const games = await getGames({ seasonId, teamId });
  if (!games.length) return <EmptyState title="No games scheduled" />;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{games.map((g) => <div key={g.id}><div className="eyebrow mb-1">Week {g.week}</div><GameCard game={g} teams={teams} ranks={ranks} /></div>)}</div>;
}

async function TeamRecruiting({ teamId, seasonId, teams }: any) {
  const sql = getSql();
  const [commits, classRanks, transfers] = await Promise.all([
    sql`select * from recruits where season_id = ${seasonId} and not is_transfer and coalesce(signed_team_id, committed_team_id) = ${teamId} and status in ('committed','signed') order by stars desc, national_rank`,
    getClassRankings(seasonId),
    sql`select * from recruits where season_id = ${seasonId} and is_transfer and (committed_team_id = ${teamId} or from_team_id = ${teamId})`,
  ]);
  const cr = classRanks.find((c) => c.teamId === teamId);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title="Recruiting Class Commitments" pad={false}>
          {commits.length ? (
            <table className="table">
              <thead><tr><th>Rank</th><th>Prospect</th><th>Pos</th><th>Hometown</th><th>Stars</th><th>Status</th></tr></thead>
              <tbody>{commits.map((r) => (
                <tr key={r.id}><td className="tabular text-muted">#{r.nationalRank}</td><td><Link href={`/recruiting/${r.id}`} className="font-semibold hover:text-accent">{r.firstName} {r.lastName}</Link></td><td>{r.position}</td><td className="text-muted">{r.hometown}</td><td><Stars n={r.stars} /></td><td><Badge tone={r.status === 'signed' ? 'win' : 'accent'}>{r.status}</Badge></td></tr>
              ))}</tbody>
            </table>
          ) : <div className="card-pad"><EmptyState title="No commitments yet" /></div>}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Class Ranking">
          {cr ? <div className="grid grid-cols-2 gap-3"><StatTile label="National rank" value={`#${cr.rank}`} /><StatTile label="Score" value={cr.score.toFixed(1)} /><StatTile label="Commits" value={cr.commits} /><StatTile label="Avg stars" value={cr.avgStars.toFixed(2)} /></div> : <p className="text-sm text-muted">Unranked.</p>}
        </Card>
        <Card title="Transfer Portal">
          {transfers.length ? (
            <ul className="space-y-2 text-sm">{transfers.map((t) => (
              <li key={t.id}><Link href={`/recruiting/${t.id}`} className="font-semibold hover:text-accent">{t.firstName} {t.lastName}</Link> <span className="text-muted">{t.position} · {t.fromTeamId === teamId ? 'outgoing' : `incoming from ${teams.get(t.fromTeamId)?.abbreviation ?? '—'}`}</span></li>
            ))}</ul>
          ) : <p className="text-sm text-muted">No portal activity.</p>}
        </Card>
      </div>
    </div>
  );
}

async function History({ team, canAddLore, isCommissioner }: { team: any; canAddLore: boolean; isCommissioner: boolean }) {
  const sql = getSql();
  const [seasons, championships, awards, timeline] = await Promise.all([
    sql`select ts.*, s.year, s.name, s.phase, s.is_demo, r.wins, r.losses, r.conf_wins, r.conf_losses
        from team_seasons ts join seasons s on s.id = ts.season_id left join team_records r on r.season_id = ts.season_id and r.team_id = ts.team_id
        where ts.team_id = ${team.id} order by s.year desc`,
    sql`select c.*, s.year, cf.short_name from championships c join seasons s on s.id = c.season_id left join conferences cf on cf.id = c.conference_id where c.team_id = ${team.id} order by s.year desc`,
    sql`select a.*, s.year, p.first_name, p.last_name from awards a left join seasons s on s.id = a.season_id left join players p on p.id = a.player_id where a.team_id = ${team.id} order by s.year desc`,
    sql`select * from team_timeline_events where team_id = ${team.id} order by year desc, created_at desc`,
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="Season by Season" pad={false}>
          <table className="table tabular">
            <thead><tr><th>Season</th><th>Record</th><th>Conf</th><th>Final rank</th><th>Honors</th></tr></thead>
            <tbody>{seasons.map((s) => (
              <tr key={s.seasonId}>
                <td className="font-semibold">{s.year} <DemoBadge show={s.isDemo} /></td>
                <td>{s.finalWins ?? s.wins ?? 0}-{s.finalLosses ?? s.losses ?? 0}</td>
                <td>{s.finalConfWins ?? s.confWins ?? 0}-{s.finalConfLosses ?? s.confLosses ?? 0}</td>
                <td>{s.finalRank ? `#${s.finalRank}` : s.phase === 'archived' ? 'NR' : 'In progress'}</td>
                <td className="space-x-1">{s.nationalChampion && <Badge tone="gold">National Champs</Badge>}{s.conferenceChampion && <Badge tone="accent">Conf Champs</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Championships & Awards">
          {championships.length || awards.length ? (
            <ul className="space-y-2 text-sm">
              {championships.map((c) => <li key={c.id}>🏆 <b>{c.year}</b> {c.kind === 'national' ? 'National Champions' : `${c.shortName} Champions`}</li>)}
              {awards.map((a) => <li key={a.id}>🎖 <b>{a.year}</b> {a.name}{a.firstName ? ` — ${a.firstName} ${a.lastName}` : ''}</li>)}
            </ul>
          ) : <p className="text-sm text-muted">No titles yet. History is being written.</p>}
        </Card>
      </div>
      <Card title="Program Timeline">
        <p className="mb-3 text-xs text-muted">Official events are recorded automatically from results. Lore entries are storytelling and never change official records.</p>
        {canAddLore && (
          <ActionForm action={addTimelineAction} resetOnSuccess className="mb-4 grid gap-2 rounded-xl border border-line p-3">
            <input type="hidden" name="teamId" value={team.id} />
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <input name="year" type="number" required defaultValue={new Date().getFullYear()} className="input" aria-label="Year" />
              <input name="title" required placeholder="e.g. The Snow Bowl" className="input" aria-label="Title" />
            </div>
            <textarea name="description" rows={2} className="input" placeholder="What happened?" />
            {isCommissioner && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="official" /> Official historical event (commissioner)</label>}
            <Submit className="btn-ghost btn-sm justify-self-start">Add to timeline</Submit>
          </ActionForm>
        )}
        <ol className="relative space-y-4 border-l border-line pl-5">
          {timeline.map((e) => (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${e.kind === 'official' ? 'bg-accent' : 'bg-gold'}`} />
              <div className="flex items-center gap-2"><span className="font-display text-lg font-bold">{e.year}</span><Badge tone={e.kind === 'official' ? 'accent' : 'gold'}>{e.kind === 'official' ? 'Official' : 'Lore'}</Badge></div>
              <div className="font-semibold">{e.title}</div>
              {e.description && <p className="text-sm text-muted">{e.description}</p>}
              {e.gameId && <Link href={`/games/${e.gameId}`} className="text-xs font-semibold text-accent">View game →</Link>}
            </li>
          ))}
          {!timeline.length && <li className="text-sm text-muted">No timeline entries yet.</li>}
        </ol>
      </Card>
    </div>
  );
}

async function Rivalries({ teamId, teams }: any) {
  const sql = getSql();
  const rivals = await sql`
    select r.*, case when r.team_a_id = ${teamId} then r.team_b_id else r.team_a_id end as opp_id,
      (select count(*)::int from games g where g.status = 'final' and g.game_type <> 'exhibition' and g.winner_team_id = ${teamId}
        and ((g.home_team_id = r.team_a_id and g.away_team_id = r.team_b_id) or (g.home_team_id = r.team_b_id and g.away_team_id = r.team_a_id))) as wins,
      (select count(*)::int from games g where g.status = 'final' and g.game_type <> 'exhibition' and g.winner_team_id <> ${teamId}
        and ((g.home_team_id = r.team_a_id and g.away_team_id = r.team_b_id) or (g.home_team_id = r.team_b_id and g.away_team_id = r.team_a_id))) as losses,
      (select row_to_json(x) from (select g.id, g.home_score, g.away_score, g.home_team_id, s.year from games g join seasons s on s.id = g.season_id
        where g.status = 'final' and ((g.home_team_id = r.team_a_id and g.away_team_id = r.team_b_id) or (g.home_team_id = r.team_b_id and g.away_team_id = r.team_a_id))
        order by g.finalized_at desc limit 1) x) as last_game
    from rivalries r where r.team_a_id = ${teamId} or r.team_b_id = ${teamId}`;
  if (!rivals.length) return <EmptyState title="No designated rivalries" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rivals.map((r) => {
        const opp = teams.get(r.oppId);
        if (!opp) return null;
        return (
          <Card key={r.id} title={r.name}>
            <div className="flex items-center gap-4">
              <TeamLogo team={opp} size={56} />
              <div className="flex-1">
                <Link href={`/teams/${opp.slug}`} className="font-semibold hover:text-accent">{opp.school}</Link>
                {r.trophy && <div className="text-xs text-muted">Trophy: {r.trophy}</div>}
                <div className="tabular mt-1 font-display text-2xl font-bold">Series {r.wins}–{r.losses}</div>
                {r.lastGame && <Link href={`/games/${r.lastGame.id}`} className="text-xs font-semibold text-accent">Last meeting ({r.lastGame.year}): {r.lastGame.home_score}-{r.lastGame.away_score} →</Link>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

async function TeamNews({ teamId }: { teamId: string }) {
  const articles = await getSql()`select a.* from articles a where a.status = 'published' and (a.team_id = ${teamId} or exists (select 1 from article_teams t where t.article_id = a.id and t.team_id = ${teamId})) order by published_at desc limit 30`;
  if (!articles.length) return <EmptyState title="No stories yet" />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {articles.map((a) => (
        <Link key={a.id} href={`/news/${a.slug}`} className="card card-pad group block">
          <div className="mb-1 flex items-center gap-2"><span className="eyebrow">{ARTICLE_CATEGORIES[a.category]}</span>{a.isOfficial ? <Badge>Official</Badge> : <Badge tone="gold">Team lore</Badge>}<DemoBadge show={a.isDemo} /></div>
          <div className="font-semibold group-hover:text-accent">{a.headline}</div>
          {a.subheadline && <div className="text-sm text-muted">{a.subheadline}</div>}
        </Link>
      ))}
    </div>
  );
}
