'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/action-form';
import { saveSimSettingsAction } from '../actions';
import { SIM_SETTING_LABELS, type SimSettings } from '@/lib/sim/types';

export function SimSliders({ initial }: { initial: SimSettings }) {
  const [v, setV] = useState(initial);
  return (
    <ActionForm action={saveSimSettingsAction} className="space-y-4">
      {(Object.keys(SIM_SETTING_LABELS) as (keyof SimSettings)[]).map((k) => (
        <label key={k} className="block">
          <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{SIM_SETTING_LABELS[k]}</span><span className="tabular text-muted">{v[k]}</span></div>
          <input type="range" name={k} min={0} max={100} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />
        </label>
      ))}
      <div className="flex gap-2">
        <Submit>Save simulation settings</Submit>
        <button type="button" className="btn-ghost" onClick={() => setV(Object.fromEntries(Object.keys(v).map((k) => [k, 50])) as unknown as SimSettings)}>Reset to 50</button>
      </div>
    </ActionForm>
  );
}
