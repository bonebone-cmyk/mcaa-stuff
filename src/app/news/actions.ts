'use server';
import { revalidatePath } from 'next/cache';
import { getSql } from '@/lib/db';
import { requireActor } from '@/lib/auth/session';
import { bool, runAction, str, type ActionState } from '@/lib/actions';
import { addComment, deleteArticle, saveArticle } from '@/lib/services/articles';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { canPublishLore } from '@/lib/auth/permissions';
import { getSettings } from '@/lib/services/settings';

type A = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const list = (fd: FormData, k: string) => str(fd, k).split(',').map((s) => s.trim()).filter(Boolean);

export const saveArticleAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  const row = await saveArticle(getSql(), actor, {
    headline: str(fd, 'headline'), subheadline: str(fd, 'subheadline') || null, coverImageUrl: str(fd, 'coverImageUrl') || null,
    bodyHtml: str(fd, 'bodyHtml'), category: str(fd, 'category'), tags: list(fd, 'tags').slice(0, 12),
    teamId: str(fd, 'teamId') || null, relatedTeamIds: list(fd, 'relatedTeamIds'), relatedPlayerIds: list(fd, 'relatedPlayerIds'),
    relatedGameIds: list(fd, 'relatedGameIds'), publish: str(fd, 'intent') === 'publish', isOfficial: bool(fd, 'isOfficial'),
    isFeatured: bool(fd, 'isFeatured'), isBreaking: bool(fd, 'isBreaking'), commentsEnabled: bool(fd, 'commentsEnabled'),
  }, str(fd, 'id') || undefined);
  revalidatePath('/', 'layout');
  return { ok: true, message: row.status === 'published' ? 'Published.' : 'Draft saved.', data: { redirect: `/news/${row.slug}` } };
});

export const deleteArticleAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  await deleteArticle(getSql(), actor, str(fd, 'id'));
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Deleted.', data: { redirect: '/news' } };
});

export const commentAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  await addComment(getSql(), actor, str(fd, 'articleId'), str(fd, 'body'));
  revalidatePath(`/news/${str(fd, 'slug')}`);
  return 'Comment posted.';
});

/** Uploads an article image to Supabase Storage (authors only) and returns its public URL */
export async function uploadArticleImage(fd: FormData): Promise<{ url?: string; error?: string }> {
  const r = await runAction(async () => {
    const actor = await requireActor();
    const settings = await getSettings(getSql());
    if (!canPublishLore(actor, actor.ownedTeamIds[0] ?? actor.assistantTeamIds[0] ?? null, settings)) throw new Error('You cannot upload images.');
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) throw new Error('Choose an image');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Images must be PNG, JPG, WEBP or GIF');
    if (file.size > 5 * 1024 * 1024) throw new Error('Images must be under 5 MB');
    const admin = createSupabaseAdmin();
    if (!admin) throw new Error('Storage is not configured — paste an image URL instead.');
    const path = `articles/${actor.userId}/${Date.now()}.${file.type.split('/')[1]}`;
    const { error } = await admin.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return { ok: true, message: 'Uploaded', data: { url: admin.storage.from('media').getPublicUrl(path).data.publicUrl } };
  });
  return r.ok ? { url: r.data?.url as string } : { error: r.message };
}
