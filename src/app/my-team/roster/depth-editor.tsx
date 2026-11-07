'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/action-form';
import { depthChartAction } from '../actions';

interface P { id: string; name: string; overall: number; injured: boolean; cls: string }

export function DepthEditor({ teamId, slot, starters, players }: { teamId: string; slot: string; starters: number; players: P[] }) {
  const [order, setOrder] = useState(players);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const dirty = order.some((p, i) => p.id !== players[i]?.id);
  return (
    <ActionForm action={depthChartAction} className="card card-pad">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="slot" value={slot} />
      <input type="hidden" name="order" value={order.map((p) => p.id).join(',')} />
      <div className="mb-2 flex items-center justify-between"><h3 className="section-title">{slot}</h3><span className="text-xs text-muted">{starters} starter{starters > 1 ? 's' : ''}</span></div>
      <ol className="space-y-1">
        {order.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${i < starters ? 'bg-accent/10 font-semibold' : ''}`}>
            <span className="tabular w-4 text-xs text-muted">{i + 1}</span>
            <span className="flex-1 truncate">{p.name} <span className="text-xs font-normal text-muted">{p.cls}</span>{p.injured && <span className="ml-1 text-xs text-loss">INJ</span>}</span>
            <span className="tabular text-xs font-bold">{p.overall}</span>
            <button type="button" className="rounded px-1 text-muted hover:text-fg" onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}>▲</button>
            <button type="button" className="rounded px-1 text-muted hover:text-fg" onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`}>▼</button>
          </li>
        ))}
      </ol>
      <Submit className={`btn-sm mt-2 ${dirty ? 'btn-primary' : 'btn-ghost'}`}>Save {slot}</Submit>
    </ActionForm>
  );
}
