import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, DemoBadge, EmptyState, FilterBar, PageHeader, Select, TeamLogo } from '@/components/ui';
import { getActor } from '@/lib/auth/session';
import { getTeamMap, getTeams } from '@/lib/queries';
import { ARTICLE_CATEGORIES } from '@/lib/services/articles';

export const metadata = { title: 'News & Lore' };

export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sql = getSql();
  const [actor, teams, teamList] = await Promise.all([getActor(), getTeamMap(), getTeams()]);
  const team = teamList.find((t) => t.slug === sp.team);
  const articles = await sql`
    select a.*, p.display_name as author from articles a left join profiles p on p.id = a.author_id
    where (a.status = 'published' ${actor ? sql`or a.author_id = ${actor.userId}` : sql``} ${actor?.role === 'commissioner' ? sql`or true` : sql``})
      ${sp.cat ? sql`and a.category = ${sp.cat}` : sql``}
      ${sp.kind === 'official' ? sql`and a.is_official` : sp.kind === 'lore' ? sql`and not a.is_official` : sql``}
      ${team ? sql`and (a.team_id = ${team.id} or exists (select 1 from article_teams t where t.article_id = a.id and t.team_id = ${team.id}))` : sql``}
      ${sp.q ? sql`and (a.headline ilike ${'%' + sp.q + '%'} or ${sp.q} = any(a.tags))` : sql``}
    order by a.is_featured desc, coalesce(a.published_at, a.created_at) desc limit 60`;
  return (
    <div>
      <PageHeader title="News & Lore" actions={actor ? <Link href="/news/new" className="btn-primary">Write a story</Link> : null}>
        Official league news and the storylines of the universe. Lore never alters official results.
      </PageHeader>
      <FilterBar>
        <label className="min-w-[12rem] flex-1"><span className="label">Search</span><input name="q" defaultValue={sp.q} className="input" placeholder="Headline or tag" /></label>
        <Select name="cat" value={sp.cat} label="Category" options={[{ value: '', label: 'All categories' }, ...Object.entries(ARTICLE_CATEGORIES).map(([value, label]) => ({ value, label }))]} />
        <Select name="kind" value={sp.kind} label="Type" options={[{ value: '', label: 'All' }, { value: 'official', label: 'Official' }, { value: 'lore', label: 'Team lore' }]} />
        <Select name="team" value={sp.team} label="Team" options={[{ value: '', label: 'All teams' }, ...teamList.map((t) => ({ value: t.slug, label: t.school }))]} />
      </FilterBar>
      {!articles.length ? <EmptyState title="No stories yet" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a, i) => {
            const t = a.teamId ? teams.get(a.teamId) : null;
            return (
              <Link key={a.id} href={`/news/${a.slug}`} className={`card group block overflow-hidden transition hover:-translate-y-0.5 ${i === 0 && a.isFeatured ? 'md:col-span-2' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.coverImageUrl ? <img src={a.coverImageUrl} alt="" className="h-44 w-full object-cover" /> : <div className="h-2" style={{ background: t?.primaryColor ?? 'rgb(var(--accent))' }} />}
                <div className="card-pad">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="eyebrow">{ARTICLE_CATEGORIES[a.category]}</span>
                    {a.isBreaking && <Badge tone="accent">Breaking</Badge>}
                    {a.isOfficial ? <Badge>Official</Badge> : <Badge tone="gold">Lore</Badge>}
                    {a.status === 'draft' && <Badge tone="loss">Draft</Badge>}
                    <DemoBadge show={a.isDemo} />
                  </div>
                  <h2 className="font-display text-xl font-bold leading-tight group-hover:text-accent">{a.headline}</h2>
                  {a.subheadline && <p className="mt-1 line-clamp-2 text-sm text-muted">{a.subheadline}</p>}
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">{t && <TeamLogo team={t} size={16} />}{a.author ?? 'CFU Newsroom'} · {new Date(a.publishedAt ?? a.createdAt).toLocaleDateString()}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
