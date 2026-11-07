'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/action-form';
import { manualResultAction, reopenGameAction, simulateGameAction } from '@/app/commissioner/actions';

export function GameAdminPanel({ gameId, status, homeAbbr, awayAbbr }: { gameId: string; status: string; version: number; homeAbbr: string; awayAbbr: string }) {
  const [manual, setManual] = useState(false);
  return (
    <section className="card card-pad border-accent/40">
      <div className="eyebrow mb-3 text-accent">Commissioner controls</div>
      {status === 'scheduled' ? (
        <div className="space-y-4">
          <ActionForm action={simulateGameAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="gameId" value={gameId} />
            <label className="w-48"><span className="label">Seed (optional)</span><input name="seed" className="input" placeholder="auto (reproducible)" /></label>
            <Submit name="mode" value="quick" className="btn-ghost">Quick Sim</Submit>
            <Submit name="mode" value="detailed" className="btn-ghost">Detailed Sim</Submit>
            <Submit name="mode" value="live" className="btn-primary">Live Sim ▶</Submit>
            <button type="button" className="btn-ghost" onClick={() => setManual((v) => !v)}>Manual result</button>
          </ActionForm>
          {manual && (
            <ActionForm action={manualResultAction} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
              <input type="hidden" name="gameId" value={gameId} />
              {[['away', awayAbbr], ['home', homeAbbr]].map(([side, abbr]) => (
                <fieldset key={side} className="space-y-2">
                  <legend className="font-display text-lg font-bold">{abbr}</legend>
                  <label className="block"><span className="label">Final score</span><input name={`${side}Score`} type="number" min={0} required className="input" /></label>
                  <label className="block"><span className="label">Quarter scores (e.g. 7,3,14,0)</span><input name={`${side}Quarters`} className="input" placeholder="optional" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className="label">Pass yds</span><input name={`${side}PassYards`} type="number" className="input" /></label>
                    <label><span className="label">Rush yds</span><input name={`${side}RushYards`} type="number" className="input" /></label>
                    <label><span className="label">Turnovers</span><input name={`${side}Turnovers`} type="number" min={0} className="input" /></label>
                    <label><span className="label">1st downs</span><input name={`${side}FirstDowns`} type="number" min={0} className="input" /></label>
                  </div>
                </fieldset>
              ))}
              <label className="sm:col-span-2"><span className="label">Notes (e.g. "Played in EA Sports College Football")</span><input name="notes" className="input" /></label>
              <div className="sm:col-span-2"><Submit>Save official result</Submit></div>
            </ActionForm>
          )}
        </div>
      ) : (
        <ActionForm action={reopenGameAction} confirm="Override this result? Its stats will be removed and the game reopened." className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="gameId" value={gameId} />
          <label className="min-w-64 flex-1"><span className="label">Override reason (audit log)</span><input name="reason" className="input" required /></label>
          <Submit className="btn-danger">Override result</Submit>
        </ActionForm>
      )}
    </section>
  );
}
