import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { ArticleEditor } from '@/components/article-editor';
import { requireActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { canEditArticle } from '@/lib/auth/permissions';
import { getSettings } from '@/lib/services/settings';
import { getSql } from '@/lib/db';
import { editorOptions } from '../../editor-data';

export default async function EditArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor();
  const sql = getSql();
  const [a] = await sql`select * from articles where slug = ${slug}`;
  if (!a || !canEditArticle(actor, { authorId: a.authorId, teamId: a.teamId, isOfficial: a.isOfficial }, await getSettings(sql))) notFound();
  const [t, p, g] = await Promise.all([
    sql`select team_id from article_teams where article_id = ${a.id}`, sql`select player_id from article_players where article_id = ${a.id}`, sql`select game_id from article_games where article_id = ${a.id}`,
  ]);
  const isComm = actor.role === 'commissioner';
  const opts = await editorOptions(isComm ? null : actorTeamId(actor));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Edit Story" />
      <ArticleEditor {...opts} ownTeamId={actorTeamId(actor)} isCommissioner={isComm}
        article={{ ...a, relatedTeamIds: t.map((x) => x.teamId), relatedPlayerIds: p.map((x) => x.playerId), relatedGameIds: g.map((x) => x.gameId) }} />
    </div>
  );
}
