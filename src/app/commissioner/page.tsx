import Link from 'next/link';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, DemoBadge, StatTile } from '@/components/ui';
import { getCurrentSeason, getTeams, PHASE_LABEL, weekLabel } from '@/lib/queries';
import { advanceWeekAction, closeSeasonAction, exhibitionAction, purgeDemoAction, simulateWeekAction, startNewSeasonAction } from './actions';

export default async function CommissionerHome() {
  const sql = getSql();
  const [season, teams] = await Promise.all([getCurrentSeason(), getTeams()]);
  const [counts] = await sql`select
    (select count(*)::int from profiles) as users, (select count(*)::int from team_staff where role = 'owner') as owners,
    (select count(*)::int from players where status = 'active') as players, (select count(*)::int from recruiting_actions where status = 'pending' and not is_ai) as pending`;
  const weekGames = season ? (await sql`select count(*) filter (where status = 'scheduled')::int as open, count(*)::int as total from games where season_id = ${season.id} and week = ${season.currentWeek} and game_type <> 'exhibition'`)[0] : null;
  const audit = await sql`select a.*, p.display_name from audit_log a left join profiles p on p.id = a.actor_id order by a.created_at desc limit 8`;
  const [demo] = await sql`select exists (select 1 from seasons where is_demo) or exists (select 1 from players where is_demo) as any`;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Season" value={season ? season.year : '—'} sub={season ? <span className="inline-flex items-center gap-1">{PHASE_LABEL[season.phase]} <DemoBadge show={season.isDemo} /></span> : 'Create one'} />
        <StatTile label="Week" value={season ? weekLabel(season, season.currentWeek) : '—'} sub={weekGames ? `${weekGames.open} of ${weekGames.total} games unplayed` : ''} />
        <StatTile label="Users" value={counts.users} sub={`${counts.owners} team owners`} />
        <StatTile label="Active players" value={counts.players.toLocaleString()} />
        <StatTile label="Pending approvals" value={counts.pending} sub={<Link href="/commissioner/recruiting" className="text-accent">Review →</Link>} />
      </div>
      {season ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Weekly Operations">
            <ol className="space-y-4">
              <li>
                <div className="mb-1 text-sm font-semibold">1 · Simulate this week’s games</div>
                <ActionForm action={simulateWeekAction} className="flex flex-wrap items-center gap-2">
                  <select name="mode" className="input max-w-[12rem]" defaultValue="detailed"><option value="quick">Quick sim (scores + box)</option><option value="detailed">Detailed sim (+ play-by-play)</option><option value="live">Live sim (full replay)</option></select>
                  <Submit>Sim {weekLabel(season, season.currentWeek)}</Submit>
                </ActionForm>
                <p className="mt-1 text-xs text-muted">Game of the Week is always saved for Live replay. Individual games can be simmed or entered manually in <Link href="/commissioner/games" className="text-accent">Games & Sim</Link>.</p>
              </li>
              <li>
                <div className="mb-1 text-sm font-semibold">2 · Advance the week</div>
                <ActionForm action={advanceWeekAction} confirm="Advance the universe one week? Recruiting will be processed and polls published." className="flex flex-wrap items-center gap-3">
                  <Submit>Advance week →</Submit>
                  <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="force" /> Force even if games are unplayed</label>
                </ActionForm>
                <p className="mt-1 text-xs text-muted">Processes recruiting (AI schools act too), publishes Coaches/Media/Computer (+Playoff) polls, heals injuries, creates championship games and the playoff bracket on schedule.</p>
              </li>
              {(season.phase === 'playoffs' || season.phase === 'conference_championships' || season.phase === 'regular') && (
                <li>
                  <div className="mb-1 text-sm font-semibold">3 · Close the season {season.championTeamId ? <Badge tone="gold">Champion crowned</Badge> : null}</div>
                  <ActionForm action={closeSeasonAction} confirm="Close the season? Signing day runs if needed, final records are archived and the transfer portal opens.">
                    <Submit className="btn-ghost">Close season & open portal</Submit>
                  </ActionForm>
                </li>
              )}
              {season.phase === 'offseason' && (
                <li>
                  <div className="mb-1 text-sm font-semibold">Offseason · start {season.year + 1}</div>
                  <p className="mb-2 text-xs text-muted">Advance the week a few times to run transfer-portal recruiting, then start the new season: players develop, seniors graduate, redshirts apply, signees and transfers join rosters, a schedule and new recruiting class are generated.</p>
                  <ActionForm action={startNewSeasonAction} confirm={`Start the ${season.year + 1} season? This archives ${season.year} permanently.`} className="flex items-center gap-2">
                    <input name="classSize" type="number" defaultValue={2000} min={200} max={4000} className="input max-w-[8rem]" aria-label="Recruiting class size" />
                    <Submit>Start {season.year + 1} season</Submit>
                  </ActionForm>
                </li>
              )}
            </ol>
          </Card>
          <Card title="Exhibition Simulator">
            <p className="mb-3 text-sm text-muted">Pick any two teams and simulate. Exhibitions are saved but never count toward standings, statistics or records.</p>
            <ActionForm action={exhibitionAction} className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Away</span><select name="awayId" required className="input">{teams.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select></label>
              <label><span className="label">Home</span><select name="homeId" required className="input" defaultValue={teams[1]?.id}>{teams.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select></label>
              <label><span className="label">Mode</span><select name="mode" className="input"><option value="live">Live (drive-by-drive replay)</option><option value="detailed">Detailed</option><option value="quick">Quick</option></select></label>
              <label><span className="label">Seed (optional)</span><input name="seed" className="input" placeholder="random" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="neutral" /> Neutral site</label>
              <div className="sm:col-span-2"><Submit>Simulate exhibition</Submit></div>
            </ActionForm>
          </Card>
        </div>
      ) : (
        <Card title="Get started"><p className="text-sm">No season exists. <Link href="/commissioner/league" className="font-semibold text-accent">Create the first season →</Link></p></Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent Audit Log" action={<Link href="/commissioner/audit" className="text-xs font-semibold text-accent">All →</Link>} pad={false}>
          <ul className="divide-y divide-line/60 text-sm">{audit.map((a) => <li key={a.id} className="flex justify-between gap-3 px-4 py-2"><span><span className="font-semibold">{a.action}</span> <span className="text-muted">{a.entityType}</span></span><span className="whitespace-nowrap text-xs text-muted">{a.displayName ?? 'system'} · {new Date(a.createdAt).toLocaleString()}</span></li>)}</ul>
        </Card>
        {demo.any && (
          <Card title="Demo Data">
            <p className="mb-3 text-sm text-muted">This universe contains <b>demo</b> records (season, generated players, recruits, results, articles) marked with a DEMO badge. Purging removes all of them permanently; teams, conferences, rivalries and settings stay.</p>
            <ActionForm action={purgeDemoAction} confirm="Permanently delete ALL demo data?" className="flex flex-wrap items-center gap-2">
              <input name="confirm" placeholder='Type "DELETE DEMO"' className="input max-w-xs" />
              <Submit className="btn-danger">Purge demo data</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
