'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/action-form';
import { recruitAction } from '@/app/my-team/actions';
import { PRIORITY_KEYS, PRIORITY_LABELS } from '@/lib/recruiting/engine';

export function RecruitActions({ recruitId, teamId, offered, offerPending = false, visited, scouted, costs, recent }: {
  recruitId: string; teamId: string; offered: boolean; offerPending?: boolean; visited: boolean; scouted: boolean; costs: Record<string, number>;
  recent: { id: string; type: string; status: string; week: number; note: string | null }[];
}) {
  const [angle, setAngle] = useState<string>('prestige');
  return (
    <section className="card card-pad">
      <h2 className="section-title mb-1">Recruit This Prospect</h2>
      <p className="mb-3 text-xs text-muted">Actions spend this week’s recruiting points. Results are decided by the recruiting engine when the commissioner advances the week — you can’t set interest directly.</p>
      <ActionForm action={recruitAction} className="space-y-2">
        <input type="hidden" name="recruitId" value={recruitId} />
        <input type="hidden" name="teamId" value={teamId} />
        <div className="grid grid-cols-2 gap-2">
          {!scouted && <Submit name="type" value="scout" className="btn-ghost btn-sm">Scout ({costs.scout})</Submit>}
          <Submit name="type" value="contact" className="btn-ghost btn-sm">Contact ({costs.contact})</Submit>
          {!offered ? <Submit name="type" value="offer" className="btn-primary btn-sm">Offer scholarship</Submit> : offerPending ? <span className="btn-ghost btn-sm cursor-default opacity-70">Offer queued</span> : <Submit name="type" value="pull_offer" className="btn-danger btn-sm">Pull offer</Submit>}
          {offered && !visited && <Submit name="type" value="visit" className="btn-ghost btn-sm">Official visit ({costs.visit})</Submit>}
        </div>
        <div className="flex gap-2">
          <select name="pitchAngle" value={angle} onChange={(e) => setAngle(e.target.value)} className="input" aria-label="Pitch angle">
            {PRIORITY_KEYS.filter((k) => k !== 'visits').map((k) => <option key={k} value={k}>Pitch: {PRIORITY_LABELS[k]}</option>)}
          </select>
          <Submit name="type" value="pitch" className="btn-ghost btn-sm whitespace-nowrap">Pitch ({costs.pitch})</Submit>
        </div>
      </ActionForm>
      {recent.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs">
          {recent.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="capitalize">Wk {a.week} · {a.type.replace('_', ' ')}</span><span className="text-muted">{a.status}{a.note ? ` — ${a.note}` : ''}</span></li>)}
        </ul>
      )}
    </section>
  );
}
