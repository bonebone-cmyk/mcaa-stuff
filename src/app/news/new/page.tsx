import { PageHeader, EmptyState } from '@/components/ui';
import { ArticleEditor } from '@/components/article-editor';
import { requireActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { getSettings } from '@/lib/services/settings';
import { getSql } from '@/lib/db';
import { editorOptions } from '../editor-data';

export const metadata = { title: 'Write a story' };

export default async function NewArticlePage() {
  const actor = await requireActor();
  const settings = await getSettings(getSql());
  const own = actorTeamId(actor);
  const isComm = actor.role === 'commissioner';
  if (!isComm && (!own || !settings.allowOwnerLore)) {
    return <EmptyState title="Publishing is limited">Only the commissioner{settings.allowOwnerLore ? ' and head coaches (for their own program)' : ''} can publish stories.</EmptyState>;
  }
  const opts = await editorOptions(isComm ? null : own);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Write a Story">{isComm ? 'Official league news or lore' : 'Lore and announcements for your program'}</PageHeader>
      <ArticleEditor {...opts} ownTeamId={own} isCommissioner={isComm} />
    </div>
  );
}
