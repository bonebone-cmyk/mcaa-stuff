'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { useRef, useState } from 'react';
import { ActionForm, Submit } from './action-form';
import { saveArticleAction, uploadArticleImage } from '@/app/news/actions';

interface Option { value: string; label: string; slug?: string }

export function ArticleEditor({ article, categories, teams, ownTeamId, isCommissioner, players, games }: {
  article?: any; categories: Option[]; teams: Option[]; ownTeamId: string | null; isCommissioner: boolean; players: Option[]; games: Option[];
}) {
  const [html, setHtml] = useState<string>(article?.bodyHtml ?? '');
  const [cover, setCover] = useState<string>(article?.coverImageUrl ?? '');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Image,
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
    ],
    content: article?.bodyHtml ?? '<p></p>',
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
    editorProps: { attributes: { class: 'prose-article min-h-[320px] px-4 py-3 focus:outline-none' } },
  });
  const btn = (label: string, onClick: () => void, active = false) => (
    <button type="button" onClick={onClick} className={`rounded-md px-2 py-1 text-xs font-bold ${active ? 'bg-accent text-white' : 'hover:bg-surface'}`}>{label}</button>
  );
  const upload = async (target: 'body' | 'cover', file: File) => {
    const fd = new FormData();
    fd.set('file', file);
    setMsg('Uploading…');
    const r = await uploadArticleImage(fd);
    if (r.error) { setMsg(r.error); return; }
    setMsg('');
    if (target === 'cover') setCover(r.url!);
    else editor?.chain().focus().setImage({ src: r.url! }).run();
  };
  const linkTo = (path: string, label: string) => editor?.chain().focus().insertContent(`<a href="${path}">${label}</a> `).run();

  return (
    <ActionForm action={saveArticleAction} className="space-y-4">
      {article?.id && <input type="hidden" name="id" value={article.id} />}
      <input type="hidden" name="bodyHtml" value={html} />
      <input type="hidden" name="coverImageUrl" value={cover} />
      <input name="headline" defaultValue={article?.headline} required maxLength={200} placeholder="Headline" className="input !py-3 font-display !text-2xl font-bold" />
      <input name="subheadline" defaultValue={article?.subheadline ?? ''} placeholder="Subheadline (optional)" className="input" />
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="label">Category</span><select name="category" defaultValue={article?.category ?? 'league_news'} className="input">{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        <label><span className="label">Program (lore scope)</span>
          <select name="teamId" defaultValue={article?.teamId ?? ownTeamId ?? ''} className="input" disabled={!isCommissioner && !!ownTeamId}>
            {isCommissioner && <option value="">League-wide</option>}
            {teams.filter((t) => isCommissioner || t.value === ownTeamId).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {!isCommissioner && ownTeamId && <input type="hidden" name="teamId" value={ownTeamId} />}
        </label>
        <label><span className="label">Tags (comma separated)</span><input name="tags" defaultValue={(article?.tags ?? []).join(', ')} className="input" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="label !mb-0">Cover image</span>
        <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://… or upload" className="input max-w-md" aria-label="Cover image URL" />
        <label className="btn-ghost btn-sm cursor-pointer">Upload<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload('cover', e.target.files[0])} /></label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={cover} alt="" className="h-12 rounded-lg object-cover" />}
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="flex flex-wrap gap-1 border-b border-line bg-surface-2 p-1.5">
          {btn('H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive('heading', { level: 2 }))}
          {btn('H3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive('heading', { level: 3 }))}
          {btn('B', () => editor?.chain().focus().toggleBold().run(), editor?.isActive('bold'))}
          {btn('I', () => editor?.chain().focus().toggleItalic().run(), editor?.isActive('italic'))}
          {btn('• List', () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive('bulletList'))}
          {btn('1. List', () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive('orderedList'))}
          {btn('Quote', () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive('blockquote'))}
          {btn('Link', () => { const u = window.prompt('Link URL (https://… or /teams/…)'); if (u) editor?.chain().focus().setLink({ href: u }).run(); })}
          {btn('Image URL', () => { const u = window.prompt('Image URL'); if (u) editor?.chain().focus().setImage({ src: u }).run(); })}
          {btn('Upload image', () => fileRef.current?.click())}
          {btn('YouTube', () => { const u = window.prompt('YouTube URL'); if (u) editor?.commands.setYoutubeVideo({ src: u }); })}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload('body', e.target.files[0])} />
          <select className="ml-auto rounded-md bg-surface px-2 text-xs" value="" onChange={(e) => { const [kind, id, label] = e.target.value.split('|'); if (id) linkTo(`/${kind}/${id}`, label); }} aria-label="Insert link to team">
            <option value="">+ Link a team…</option>
            {teams.map((t) => <option key={t.value} value={`teams|${t.slug}|${t.label}`}>{t.label}</option>)}
          </select>
        </div>
        <EditorContent editor={editor} />
      </div>
      {msg && <p className="text-sm text-loss">{msg}</p>}
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Related teams, players and games</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MultiPick name="relatedTeamIds" label="Teams" options={teams} defaults={article?.relatedTeamIds ?? []} />
          <MultiPick name="relatedPlayerIds" label="Players" options={players} defaults={article?.relatedPlayerIds ?? []} />
          <MultiPick name="relatedGameIds" label="Games" options={games} defaults={article?.relatedGameIds ?? []} />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="commentsEnabled" defaultChecked={article?.commentsEnabled ?? true} /> Allow comments</label>
        {isCommissioner && <>
          <label className="flex items-center gap-2"><input type="checkbox" name="isOfficial" defaultChecked={article?.isOfficial ?? true} /> Official league news</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={article?.isFeatured} /> Featured</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isBreaking" defaultChecked={article?.isBreaking} /> Breaking news</label>
        </>}
      </div>
      <p className="text-xs text-muted">Lore is storytelling: publishing never changes official scores, statistics or records.</p>
      <div className="flex gap-2">
        <Submit name="intent" value="publish">Publish</Submit>
        <Submit name="intent" value="draft" className="btn-ghost">Save draft</Submit>
      </div>
    </ActionForm>
  );
}

function MultiPick({ name, label, options, defaults }: { name: string; label: string; options: Option[]; defaults: string[] }) {
  const [sel, setSel] = useState<string[]>(defaults);
  return (
    <label>
      <span className="label">{label}</span>
      <select multiple value={sel} onChange={(e) => setSel([...e.target.selectedOptions].map((o) => o.value))} className="input h-32">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input type="hidden" name={name} value={sel.join(',')} />
    </label>
  );
}
