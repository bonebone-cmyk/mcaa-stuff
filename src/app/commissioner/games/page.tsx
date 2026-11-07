import Link from 'next/link';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, EmptyState, TeamLogo } from '@/components/ui';
import { getCurrentSeason, getGames, getTeamMap, getTeams, weekLabel } from '@/lib/queries';
import { deleteGameAction, saveGameAction, simulateGameAction } from '../actions';

const toLocal = (d: Date | null) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default async function CommissionerGames({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const season = await getCurrentSeason();
  if (!season) return <EmptyState title="Create a season first" />;
  const week = sp.week ? Number(sp.week) : season.currentWeek;
  const [games, teams, teamList, networks] = await Promise.all([getGames({ seasonId: season.id, week }), getTeamMap(), getTeams(), getSql()`select * from tv_networks order by tier, name`]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1">
        {Array.from({ length: season.regularSeasonWeeks + 6 }, (_, i) => i + 1).map((w) => (
          <Link key={w} href={`/commissioner/games?week=${w}`} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${w === week ? 'bg-accent text-white' : 'bg-surface text-muted'}`}>{w}</Link>
        ))}
      </div>
      <Card title={`${weekLabel(season, week)} · ${games.length} games`} pad={false}>
        {games.length ? (
          <ul className="divide-y divide-line/60">{games.map((g) => {
            const h = teams.get(g.homeTeamId)!;
            const a = teams.get(g.awayTeamId)!;
            return (
              <li key={g.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                    <span className="flex min-w-[16rem] flex-1 items-center gap-2 text-sm font-semibold"><TeamLogo team={a} size={20} />{a.abbreviation} {g.neutralSite ? 'vs' : '@'} <TeamLogo team={h} size={20} />{h.abbreviation}
                      {g.isGameOfWeek && <Badge tone="accent">GOTW</Badge>}{g.gameType !== 'regular' && <Badge>{g.gameType.replace('_', ' ')}</Badge>}</span>
                    {g.status === 'final' ? <Link href={`/games/${g.id}`} className="tabular text-sm font-bold text-win">Final {g.awayScore}-{g.homeScore}</Link> : (
                      <ActionForm action={simulateGameAction} className="flex gap-1">
                        <input type="hidden" name="gameId" value={g.id} />
                        <Submit name="mode" value="quick" className="btn-ghost btn-sm">Quick</Submit>
                        <Submit name="mode" value="detailed" className="btn-ghost btn-sm">Detailed</Submit>
                        <Submit name="mode" value="live" className="btn-primary btn-sm">Live</Submit>
                        <Link href={`/games/${g.id}`} className="btn-ghost btn-sm">Manual…</Link>
                      </ActionForm>
                    )}
                    <span className="text-xs text-muted">Edit ▾</span>
                  </summary>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <ActionForm action={saveGameAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="gameId" value={g.id} />
                      <label><span className="label">Kickoff</span><input type="datetime-local" name="kickoffAt" defaultValue={toLocal(g.kickoffAt)} className="input" /></label>
                      <label><span className="label">TV</span><select name="tvNetworkId" defaultValue={networks.find((n) => n.name === g.networkName)?.id ?? ''} className="input"><option value="">None</option>{networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
                      <label><span className="label">Site name</span><input name="siteName" defaultValue={g.siteName ?? ''} className="input" /></label>
                      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="neutral" defaultChecked={g.neutralSite} /> Neutral</label>
                      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="gotw" defaultChecked={g.isGameOfWeek} /> Game of the Week</label>
                      <Submit className="btn-ghost btn-sm">Save</Submit>
                    </ActionForm>
                    {g.status === 'scheduled' && <ActionForm action={deleteGameAction} confirm="Delete this game?"><input type="hidden" name="gameId" value={g.id} /><Submit className="btn-danger btn-sm">Delete</Submit></ActionForm>}
                  </div>
                </details>
              </li>
            );
          })}</ul>
        ) : <div className="card-pad"><EmptyState title="No games this week" /></div>}
      </Card>
      <Card title="Schedule a Game">
        <p className="mb-3 text-sm text-muted">Add rivalry games, neutral-site classics or extra matchups to week {week}. Conference and rivalry flags are set automatically.</p>
        <ActionForm action={saveGameAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="week" value={week} />
          <label><span className="label">Away</span><select name="awayId" className="input">{teamList.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select></label>
          <label><span className="label">Home</span><select name="homeId" className="input">{teamList.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select></label>
          <label><span className="label">Kickoff</span><input type="datetime-local" name="kickoffAt" className="input" /></label>
          <label><span className="label">TV network</span><select name="tvNetworkId" className="input"><option value="">None</option>{networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
          <label><span className="label">Site name</span><input name="siteName" className="input" placeholder="e.g. Mercedes-Benz Stadium" /></label>
          <div className="flex items-end gap-3 text-sm"><label className="flex items-center gap-1"><input type="checkbox" name="neutral" /> Neutral site</label><label className="flex items-center gap-1"><input type="checkbox" name="gotw" /> GOTW</label></div>
          <div className="sm:col-span-3"><Submit>Add game</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
