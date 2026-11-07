import Link from 'next/link';
import { GameCard } from '@/components/games/game-card';
import { DemoBadge, EmptyState, FilterBar, PageHeader, Select } from '@/components/ui';
import { getConferences, getGames, getRankMap, getTeamMap, resolveSeason, weekLabel } from '@/lib/queries';
import { getSql } from '@/lib/db';

export const metadata = { title: 'Scores' };

export default async function ScoresPage({ searchParams }: { searchParams: Promise<{ week?: string; conf?: string; season?: string }> }) {
  const sp = await searchParams;
  const season = await resolveSeason(sp.season);
  if (!season) return <EmptyState title="No season yet" />;
  const [{ maxWeek }] = await getSql()`select coalesce(max(week), 0) as max_week from games where season_id = ${season.id}`;
  const week = sp.week !== undefined ? Number(sp.week) : Math.min(season.currentWeek, maxWeek);
  const [games, teams, ranks, confs] = await Promise.all([getGames({ seasonId: season.id, week }), getTeamMap(), getRankMap(season.id), getConferences()]);
  const filtered = games.filter((g) => !sp.conf || teams.get(g.homeTeamId)?.conferenceSlug === sp.conf || teams.get(g.awayTeamId)?.conferenceSlug === sp.conf);
  const ranked = (g: (typeof games)[number]) => Math.min(ranks.get(g.homeTeamId) ?? 99, ranks.get(g.awayTeamId) ?? 99);
  const top = filtered.filter((g) => ranked(g) <= 25).sort((a, b) => ranked(a) - ranked(b));
  const rest = filtered.filter((g) => ranked(g) > 25);
  const weeks = Array.from({ length: maxWeek + 1 }, (_, i) => i).filter((w) => w > 0);
  return (
    <div>
      <PageHeader title="Scores" eyebrow={<span className="flex items-center gap-2">{season.name} <DemoBadge show={season.isDemo} /></span>}>{weekLabel(season, week)} · {filtered.length} games</PageHeader>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {weeks.map((w) => (
          <Link key={w} href={`/scores?week=${w}${sp.conf ? `&conf=${sp.conf}` : ''}`} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${w === week ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-fg'}`}>
            {w <= season.regularSeasonWeeks ? `Wk ${w}` : weekLabel(season, w).replace('Playoffs · ', '')}
          </Link>
        ))}
      </div>
      <FilterBar>
        <input type="hidden" name="week" value={week} />
        <Select name="conf" value={sp.conf} label="Conference" options={[{ value: '', label: 'All conferences' }, ...confs.map((c) => ({ value: c.slug, label: c.shortName }))]} />
      </FilterBar>
      {!filtered.length && <EmptyState title="No games this week" />}
      {top.length > 0 && <h2 className="section-title mb-3">Top 25</h2>}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{top.map((g) => <GameCard key={g.id} game={g} teams={teams} ranks={ranks} />)}</div>
      {rest.length > 0 && top.length > 0 && <h2 className="section-title mb-3">All other games</h2>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rest.map((g) => <GameCard key={g.id} game={g} teams={teams} ranks={ranks} />)}</div>
    </div>
  );
}
