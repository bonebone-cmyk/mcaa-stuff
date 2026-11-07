import sanitizeHtml from 'sanitize-html';
import type { Sql } from '../db';
import { insertMany } from '../db';
import { canEditArticle, canPublishLore, canPublishOfficial, PermissionError, type Actor } from '../auth/permissions';
import { getSettings } from './settings';
import { logAudit } from './audit';
import { slugify } from './teams';

export const ARTICLE_CATEGORIES: Record<string, string> = {
  breaking_news: 'Breaking News', rivalry: 'Rivalry Story', coaching_controversy: 'Coaching Controversy',
  recruiting_battle: 'Recruiting Battle', player_bio: 'Player Biography', championship_history: 'Championship History',
  team_tradition: 'Team Tradition', program_rebuild: 'Program Rebuild', legendary_performance: 'Legendary Performance',
  historical_event: 'Historical Event', power_rankings: 'Power Rankings', playoff_predictions: 'Playoff Predictions',
  transfer_announcement: 'Transfer Announcement', press_conference: 'Press Conference', announcement: 'Team Announcement',
  league_news: 'League News',
};

/** Article HTML is sanitized server-side: no scripts, styles or event handlers; only trusted video embeds. */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption', 'code', 'pre', 'iframe', 'div'],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'frameborder', 'allow'],
      div: ['data-youtube-video'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  });
}

export interface ArticleInput {
  headline: string;
  subheadline?: string | null;
  coverImageUrl?: string | null;
  bodyHtml: string;
  category: string;
  tags: string[];
  teamId: string | null;
  relatedTeamIds: string[];
  relatedPlayerIds: string[];
  relatedGameIds: string[];
  publish: boolean;
  isOfficial: boolean;
  isFeatured: boolean;
  isBreaking: boolean;
  commentsEnabled: boolean;
}

function validate(input: ArticleInput) {
  if (!input.headline.trim() || input.headline.length > 200) throw new Error('Headline is required (max 200 characters)');
  if (!(input.category in ARTICLE_CATEGORIES)) throw new Error('Unknown category');
  if (input.coverImageUrl && !/^https?:\/\//.test(input.coverImageUrl)) throw new Error('Cover image must be an http(s) URL');
}

async function writeLinks(tx: any, articleId: string, input: ArticleInput) {
  await tx`delete from article_teams where article_id = ${articleId}`;
  await tx`delete from article_players where article_id = ${articleId}`;
  await tx`delete from article_games where article_id = ${articleId}`;
  const teams = [...new Set([...(input.teamId ? [input.teamId] : []), ...input.relatedTeamIds])];
  await insertMany(tx, 'article_teams', teams.map((teamId) => ({ articleId, teamId })));
  await insertMany(tx, 'article_players', [...new Set(input.relatedPlayerIds)].map((playerId) => ({ articleId, playerId })));
  await insertMany(tx, 'article_games', [...new Set(input.relatedGameIds)].map((gameId) => ({ articleId, gameId })));
}

/**
 * Publishing lore only creates an article. It never touches games, stats or
 * records — official history and fictional storylines stay separate.
 */
export async function saveArticle(sql: Sql, actor: Actor, input: ArticleInput, articleId?: string) {
  validate(input);
  const settings = await getSettings(sql);
  const official = input.isOfficial || input.isFeatured || input.isBreaking;
  if (official && !canPublishOfficial(actor)) throw new PermissionError('Only the commissioner can publish official, featured or breaking news.');
  if (!canPublishLore(actor, input.teamId, settings)) throw new PermissionError('You can only publish lore for your own program.');
  const body = sanitizeArticleHtml(input.bodyHtml);
  return sql.begin(async (tx) => {
    if (articleId) {
      const [a] = await tx`select * from articles where id = ${articleId} for update`;
      if (!a) throw new Error('Article not found');
      if (!canEditArticle(actor, { authorId: a.authorId, teamId: a.teamId, isOfficial: a.isOfficial }, settings)) throw new PermissionError();
      const [row] = await tx`update articles set headline = ${input.headline.trim()}, subheadline = ${input.subheadline ?? null},
          cover_image_url = ${input.coverImageUrl ?? null}, body_html = ${body}, category = ${input.category}, tags = ${input.tags},
          team_id = ${input.teamId}, is_official = ${input.isOfficial}, is_featured = ${input.isFeatured}, is_breaking = ${input.isBreaking},
          comments_enabled = ${input.commentsEnabled}, status = ${input.publish ? 'published' : 'draft'},
          published_at = case when ${input.publish} and published_at is null then now() when not ${input.publish} then null else published_at end,
          updated_at = now() where id = ${articleId} returning *`;
      await writeLinks(tx, articleId, input);
      await logAudit(tx, actor.userId, 'article.updated', 'article', articleId, { headline: input.headline, published: input.publish });
      return row;
    }
    let slug = slugify(input.headline) || 'story';
    const clash = await tx`select 1 from articles where slug = ${slug}`;
    if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
    const [row] = await tx`insert into articles (slug, headline, subheadline, cover_image_url, body_html, category, tags, author_id, team_id,
        status, is_official, is_featured, is_breaking, comments_enabled, published_at)
      values (${slug}, ${input.headline.trim()}, ${input.subheadline ?? null}, ${input.coverImageUrl ?? null}, ${body}, ${input.category},
        ${input.tags}, ${actor.userId}, ${input.teamId}, ${input.publish ? 'published' : 'draft'}, ${input.isOfficial}, ${input.isFeatured},
        ${input.isBreaking}, ${input.commentsEnabled}, ${input.publish ? new Date() : null})
      returning *`;
    await writeLinks(tx, row.id, input);
    await logAudit(tx, actor.userId, 'article.created', 'article', row.id, { headline: input.headline, published: input.publish });
    return row;
  });
}

export async function deleteArticle(sql: Sql, actor: Actor, articleId: string) {
  const settings = await getSettings(sql);
  const [a] = await sql`select * from articles where id = ${articleId}`;
  if (!a) return;
  if (!canEditArticle(actor, { authorId: a.authorId, teamId: a.teamId, isOfficial: a.isOfficial }, settings)) throw new PermissionError();
  await sql`delete from articles where id = ${articleId}`;
  await logAudit(sql, actor.userId, 'article.deleted', 'article', articleId, { headline: a.headline });
}

export async function addComment(sql: Sql, actor: Actor, articleId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 2000) throw new Error('Comments must be 1–2000 characters');
  const settings = await getSettings(sql);
  const [a] = await sql`select status, comments_enabled from articles where id = ${articleId}`;
  if (!a || a.status !== 'published' || !a.commentsEnabled || !settings.commentsEnabled) throw new Error('Comments are closed');
  await sql`insert into comments (article_id, user_id, body) values (${articleId}, ${actor.userId}, ${text})`;
}
