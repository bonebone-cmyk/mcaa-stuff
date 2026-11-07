import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, DemoBadge, TeamLogo } from '@/components/ui';
import { getActor } from '@/lib/auth/session';
import { canEditArticle } from '@/lib/auth/permissions';
import { getTeamMap } from '@/lib/queries';
import { ARTICLE_CATEGORIES, sanitizeArticleHtml } from '@/lib/services/articles';
import { getSettings } from '@/lib/services/settings';
import { commentAction, deleteArticleAction } from '../actions';

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const [a] = await getSql()`select headline, subheadline, cover_image_url from articles where slug = ${slug} and status = 'published'`.catch(() => []);
  return a ? { title: a.headline, description: a.subheadline ?? undefined, openGraph: { images: a.coverImageUrl ? [a.coverImageUrl] : [] } } : { title: 'Story' };
}

export default async function ArticlePage({ params }: P) {
  const { slug } = await params;
  const sql = getSql();
  const [a] = await sql`select a.*, p.display_name as author from articles a left join profiles p on p.id = a.author_id where a.slug = ${slug}`;
  if (!a) notFound();
  const [actor, teams, settings] = await Promise.all([getActor(), getTeamMap(), getSettings(sql)]);
  if (a.status !== 'published' && a.authorId !== actor?.userId && actor?.role !== 'commissioner') notFound();
  const [relTeams, relPlayers, relGames, comments] = await Promise.all([
    sql`select team_id from article_teams where article_id = ${a.id}`,
    sql`select p.id, p.first_name, p.last_name, p.position from article_players ap join players p on p.id = ap.player_id where ap.article_id = ${a.id}`,
    sql`select g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score, g.status from article_games ag join games g on g.id = ag.game_id where ag.article_id = ${a.id}`,
    sql`select c.*, p.display_name from comments c join profiles p on p.id = c.user_id where c.article_id = ${a.id} order by c.created_at`,
  ]);
  const team = a.teamId ? teams.get(a.teamId) : null;
  const editable = canEditArticle(actor, { authorId: a.authorId, teamId: a.teamId, isOfficial: a.isOfficial }, settings);
  const commentsOpen = a.commentsEnabled && settings.commentsEnabled && a.status === 'published';
  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{ARTICLE_CATEGORIES[a.category]}</Badge>
        {a.isOfficial ? <Badge>Official league news</Badge> : <Badge tone="gold">Lore · not official record</Badge>}
        {a.isBreaking && <Badge tone="loss">Breaking</Badge>}
        {a.status === 'draft' && <Badge tone="loss">Draft</Badge>}
        <DemoBadge show={a.isDemo} />
      </div>
      <h1 className="font-display text-4xl font-black leading-tight sm:text-5xl">{a.headline}</h1>
      {a.subheadline && <p className="mt-2 text-xl text-muted">{a.subheadline}</p>}
      <div className="mt-4 flex items-center gap-3 border-y border-line py-3 text-sm">
        {team && <TeamLogo team={team} size={28} />}
        <span><span className="font-semibold">{a.author ?? 'CFU Newsroom'}</span><span className="text-muted"> · {new Date(a.publishedAt ?? a.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span></span>
        {editable && <span className="ml-auto flex gap-2"><Link href={`/news/${a.slug}/edit`} className="btn-ghost btn-sm">Edit</Link>
          <ActionForm action={deleteArticleAction} confirm="Delete this article permanently?"><input type="hidden" name="id" value={a.id} /><Submit className="btn-danger btn-sm">Delete</Submit></ActionForm></span>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a.coverImageUrl && <img src={a.coverImageUrl} alt="" className="mt-6 w-full rounded-2xl object-cover" />}
      {/* Body HTML is sanitized on save and again on render */}
      <div className="prose-article mt-6" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(a.bodyHtml) }} />
      {a.tags?.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{a.tags.map((t: string) => <Link key={t} href={`/news?q=${encodeURIComponent(t)}`} className="chip">#{t}</Link>)}</div>}
      {(relTeams.length > 0 || relPlayers.length > 0 || relGames.length > 0) && (
        <Card title="Related" className="mt-8">
          <div className="flex flex-wrap gap-3 text-sm">
            {relTeams.map((r) => { const t = teams.get(r.teamId); return t ? <Link key={t.id} href={`/teams/${t.slug}`} className="chip !py-1"><TeamLogo team={t} size={16} />{t.school}</Link> : null; })}
            {relPlayers.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="chip !py-1">{p.firstName} {p.lastName} · {p.position}</Link>)}
            {relGames.map((g) => <Link key={g.id} href={`/games/${g.id}`} className="chip !py-1">{teams.get(g.awayTeamId)?.abbreviation} {g.awayScore ?? ''} @ {teams.get(g.homeTeamId)?.abbreviation} {g.homeScore ?? ''}</Link>)}
          </div>
        </Card>
      )}
      <section className="mt-10">
        <h2 className="section-title mb-4">Comments ({comments.length})</h2>
        {commentsOpen ? (actor ? (
          <ActionForm action={commentAction} resetOnSuccess className="mb-6">
            <input type="hidden" name="articleId" value={a.id} /><input type="hidden" name="slug" value={a.slug} />
            <textarea name="body" required maxLength={2000} rows={3} className="input" placeholder="Add to the conversation…" />
            <Submit className="btn-primary btn-sm mt-2">Post comment</Submit>
          </ActionForm>
        ) : <p className="mb-6 text-sm text-muted"><Link href="/login" className="font-semibold text-accent">Sign in</Link> to comment.</p>) : <p className="mb-6 text-sm text-muted">Comments are closed.</p>}
        <ul className="space-y-4">{comments.map((c) => <li key={c.id} className="rounded-xl bg-surface p-3"><div className="text-sm font-semibold">{c.displayName} <span className="font-normal text-muted">· {new Date(c.createdAt).toLocaleString()}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p></li>)}</ul>
      </section>
    </article>
  );
}
