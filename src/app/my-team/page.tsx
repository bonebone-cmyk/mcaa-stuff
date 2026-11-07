import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, EmptyState, Meter, PageHeader, StatTile, TeamLink, TeamLogo } from '@/components/ui';
import { GameCard } from '@/components/games/game-card';
import { requireActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { getConferenceStandings, getCurrentSeason, getGames, getRankMap, getTeamMap, getTeamRecords, recordStr, weekLabel } from '@/lib/queries';
import { getSettings } from '@/lib/services/settings';
import { STARTERS, POSITIONS } from '@/lib/players/positions';

export const metadata = { title: 'My Team' };

export default async function MyTeamPage() {
  const actor = await requireActor();
  const teamId = actorTeamId(actor);
  if (!teamId) {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <EmptyState title="You don’t coach a program yet">The commissioner assigns team owners. {actor.role === 'commissioner' ? <Link href="/commissioner" className="font-semibold text-accent">Open the Commissioner Panel →</Link> : 'Ask your commissioner to assign you a team. Meanwhile, follow your favorite programs from their team pages.'}</EmptyState>
      </div>
    );
  }
  const sql = getSql();
  const [season, teams, settings] = await Promise.all([getCurrentSeason(), getTeamMap(), getSettings(sql)]);
  const team = teams.get(teamId)!;
  if (!season) return <EmptyState title="No active season" />;
  const [ranks, records, games, standings] = await Promise.all([
    getRankMap(season.id), getTeamRecords(season.id), getGames({ seasonId: season.id, teamId }),
    team.conferenceId ? getConferenceStandings(season.id, team.conferenceId) : Promise.resolve([]),
  ]);
  const week = season.currentWeek;
  const rules = settings.recruitingRules;
  const [budget] = await sql`select * from recruiting_budgets where season_id = ${season.id} and week = ${week} and team_id = ${teamId}`;
  const pointsLeft = budget ? budget.pointsTotal - budget.pointsSpent : rules.weeklyPoints;
  const [pending, targets, injuries, risers, news, depthGaps, recentDecisions, [{ commits }]] = await Promise.all([
    sql`select a.*, r.first_name, r.last_name from recruiting_actions a join recruits r on r.id = a.recruit_id where a.team_id = ${teamId} and a.season_id = ${season.id} and a.week = ${week} and a.status in ('pending','approved') order by a.created_at desc`,
    sql`select i.*, r.first_name, r.last_name, r.position, r.stars, r.status, r.committed_team_id from recruit_interest i join recruits r on r.id = i.recruit_id
        where i.team_id = ${teamId} and r.season_id = ${season.id} and r.status in ('uncommitted','committed') and (i.offered or i.last_action_week is not null) order by i.interest desc limit 8`,
    sql`select id, first_name, last_name, position, injury_type, injury_weeks from players where team_id = ${teamId} and status = 'active' and injury_weeks > 0 order by injury_weeks desc`,
    sql`select d.*, p.first_name, p.last_name, p.position from player_development_log d join players p on p.id = d.player_id where p.team_id = ${teamId} order by d.new_overall - d.old_overall desc limit 5`,
    sql`select slug, headline, published_at from articles a where status = 'published' and (a.team_id = ${teamId} or exists (select 1 from article_teams t where t.article_id = a.id and t.team_id = ${teamId})) order by published_at desc limit 5`,
    sql`select position, count(*)::int as n from players p where team_id = ${teamId} and status = 'active' and injury_weeks = 0 group by position`,
    sql`select c.*, r.first_name, r.last_name from commitments c join recruits r on r.id = c.recruit_id where c.season_id = ${season.id} and (c.team_id = ${teamId} or c.previous_team_id = ${teamId}) order by c.created_at desc limit 5`,
    sql`select count(*)::int as commits from recruits where season_id = ${season.id} and not is_transfer and coalesce(signed_team_id, committed_team_id) = ${teamId} and status in ('committed','signed')`,
  ]);
  const next = games.find((g) => g.status === 'scheduled');
  const recent = games.filter((g) => g.status === 'final').slice(-3).reverse();
  const healthy = new Map(depthGaps.map((d) => [d.position, d.n]));
  const thin = POSITIONS.filter((p) => (healthy.get(p) ?? 0) < STARTERS[p]);
  const todo = [
    { done: pointsLeft < 15, text: pointsLeft >= 15 ? `Spend recruiting points — ${pointsLeft} of ${budget?.pointsTotal ?? rules.weeklyPoints} left this week` : 'Recruiting points spent', href: '/my-team/recruiting' },
    { done: thin.length === 0, text: thin.length ? `Depth chart short at ${thin.join(', ')} (injuries)` : 'Depth chart has healthy starters everywhere', href: '/my-team/roster' },
    { done: targets.some((t) => t.offered), text: targets.some((t) => t.offered) ? 'Scholarship offers are out' : 'Extend scholarship offers to your top targets', href: '/recruiting' },
    { done: commits < rules.scholarshipLimit, text: `${commits}/${rules.scholarshipLimit} scholarships committed`, href: '/my-team/recruiting' },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5 text-white shadow-card" style={{ background: `linear-gradient(120deg, ${team.primaryColor}, #0b0b0d)` }}>
        <TeamLogo team={team} size={64} />
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">Head Coach Dashboard · {weekLabel(season, week)}</div>
          <h1 className="font-display text-3xl font-black uppercase">{team.school}</h1>
          <div className="text-sm text-white/80">{recordStr(records.get(teamId))}{ranks.get(teamId) ? ` · No. ${ranks.get(teamId)}` : ' · Unranked'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/my-team/recruiting" className="btn !bg-white !text-black">Recruiting board</Link>
          <Link href="/my-team/roster" className="btn !bg-white/15 !text-white">Roster & depth chart</Link>
          <Link href={`/teams/${team.slug}`} className="btn !bg-white/15 !text-white">Team page</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Action Center" action={<span className="text-xs text-muted">Before the week advances</span>}>
            <ul className="space-y-2">{todo.map((t) => (
              <li key={t.text}><Link href={t.href} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-accent/50">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${t.done ? 'bg-win/20 text-win' : 'bg-accent text-white'}`}>{t.done ? '✓' : '!'}</span>
                <span className="flex-1 font-semibold">{t.text}</span><span className="text-muted">→</span>
              </Link></li>
            ))}</ul>
          </Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Record" value={recordStr(records.get(teamId))} />
            <StatTile label="National rank" value={ranks.get(teamId) ? `#${ranks.get(teamId)}` : 'NR'} />
            <StatTile label="Recruiting pts" value={pointsLeft} sub={`of ${budget?.pointsTotal ?? rules.weeklyPoints} this week`} />
            <StatTile label="Commits" value={commits} sub={`limit ${rules.scholarshipLimit}`} />
          </div>
          {next && <Card title="Upcoming Opponent"><GameCard game={next} teams={teams} ranks={ranks} /></Card>}
          <Card title="Recruiting Targets" action={<Link href="/my-team/recruiting" className="text-xs font-semibold text-accent">Board →</Link>}>
            {targets.length ? (
              <ul className="space-y-3">{targets.map((t) => (
                <li key={t.recruitId}>
                  <div className="mb-1 flex items-center justify-between text-sm"><Link href={`/recruiting/${t.recruitId}`} className="font-semibold hover:text-accent">{t.firstName} {t.lastName} <span className="text-muted">· {t.position} · {t.stars}★</span></Link>
                    <span className="flex items-center gap-2">{t.offered && <Badge tone="accent">Offered</Badge>}{t.status === 'committed' && <Badge tone={t.committedTeamId === teamId ? 'win' : 'loss'}>{t.committedTeamId === teamId ? 'Committed to you' : `Committed: ${teams.get(t.committedTeamId)?.abbreviation}`}</Badge>}<span className="tabular font-bold">{Math.round(t.interest)}</span></span></div>
                  <Meter value={t.interest} color={team.primaryColor} />
                </li>
              ))}</ul>
            ) : <EmptyState title="No targets yet"><Link href="/recruiting" className="text-accent">Browse prospects</Link> and start contacting recruits.</EmptyState>}
          </Card>
          <Card title="Recent Results">{recent.length ? <div className="grid gap-3 sm:grid-cols-3">{recent.map((g) => <GameCard key={g.id} game={g} teams={teams} ranks={ranks} compact />)}</div> : <p className="text-sm text-muted">No games yet.</p>}</Card>
        </div>
        <div className="space-y-6">
          <Card title="Pending Recruiting Actions">
            {pending.length ? <ul className="space-y-1 text-sm">{pending.map((a) => <li key={a.id} className="flex justify-between"><span>{a.firstName} {a.lastName}</span><span className="capitalize text-muted">{a.actionType.replace('_', ' ')} · {a.points}pt{a.status === 'approved' ? ' ✓' : ''}</span></li>)}</ul> : <p className="text-sm text-muted">Nothing queued this week.</p>}
          </Card>
          <Card title="Recruiting Decisions">
            {recentDecisions.length ? <ul className="space-y-1 text-sm">{recentDecisions.map((c) => <li key={c.id}><Badge tone={c.teamId === teamId && c.event !== 'decommit' ? 'win' : 'loss'}>{c.event}</Badge> {c.firstName} {c.lastName}{c.teamId !== teamId ? ` → ${teams.get(c.teamId)?.abbreviation}` : ''}</li>)}</ul> : <p className="text-sm text-muted">No decisions yet.</p>}
          </Card>
          <Card title="Injury Report">
            {injuries.length ? <ul className="space-y-1 text-sm">{injuries.map((p) => <li key={p.id} className="flex justify-between gap-2"><Link href={`/players/${p.id}`} className="font-semibold hover:text-accent">{p.firstName} {p.lastName} <span className="text-muted">{p.position}</span></Link><span className="text-loss">{p.injuryType} · {p.injuryWeeks}w</span></li>)}</ul> : <p className="text-sm text-win">Fully healthy.</p>}
          </Card>
          <Card title="Player Development">
            {risers.length ? <ul className="space-y-1 text-sm">{risers.map((d) => <li key={d.id} className="flex justify-between"><Link href={`/players/${d.playerId}`} className="hover:text-accent">{d.firstName} {d.lastName} ({d.position})</Link><span className="text-win">{d.oldOverall} → {d.newOverall}</span></li>)}</ul> : <p className="text-sm text-muted">Progression happens each offseason.</p>}
          </Card>
          <Card title="Conference Standings" pad={false}>
            <table className="table tabular"><tbody>{standings.slice(0, 10).map((s, i) => { const t = teams.get(s.teamId); return t ? <tr key={s.teamId} className={s.teamId === teamId ? 'bg-accent/10' : ''}><td className="text-muted">{i + 1}</td><td><TeamLink team={t} size={18} /></td><td className="text-right">{s.record.confWins}-{s.record.confLosses}</td></tr> : null; })}</tbody></table>
          </Card>
          <Card title="Team News">
            {news.length ? <ul className="space-y-2 text-sm">{news.map((n) => <li key={n.slug}><Link href={`/news/${n.slug}`} className="font-semibold hover:text-accent">{n.headline}</Link></li>)}</ul> : <p className="text-sm text-muted">No stories yet. <Link href="/news/new" className="text-accent">Write one →</Link></p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
