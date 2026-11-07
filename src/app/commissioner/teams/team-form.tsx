'use client';
import { ActionForm, Submit } from '@/components/action-form';
import { saveTeamAction } from '../actions';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES, SCHEME_LABELS } from '@/lib/players/positions';

export function TeamForm({ team, conferences }: { team?: any; conferences: { id: string; name: string }[] }) {
  const f = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <label><span className="label">{label}</span><input name={name} defaultValue={team?.[name] ?? ''} className="input" {...props} /></label>
  );
  return (
    <ActionForm action={saveTeamAction} className="grid gap-3 sm:grid-cols-2">
      {team?.id && <input type="hidden" name="id" value={team.id} />}
      {f('school', 'School', { required: true })}{f('mascot', 'Mascot')}{f('abbreviation', 'Abbreviation', { maxLength: 6 })}
      {!team && f('slug', 'URL slug (optional)')}
      <label><span className="label">Conference</span><select name="conferenceId" defaultValue={team?.conferenceId ?? ''} className="input"><option value="">None</option>{conferences.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label><span className="label">Primary color</span><input type="color" name="primaryColor" defaultValue={team?.primaryColor ?? '#333333'} className="input h-10 p-1" /></label>
      <label><span className="label">Secondary color</span><input type="color" name="secondaryColor" defaultValue={team?.secondaryColor ?? '#ffffff'} className="input h-10 p-1" /></label>
      <div className="sm:col-span-2">{f('logoUrl', 'Logo URL')}</div>
      {f('city', 'City')}{f('state', 'State')}{f('latitude', 'Latitude', { type: 'number', step: 'any' })}{f('longitude', 'Longitude', { type: 'number', step: 'any' })}
      {f('stadium', 'Stadium')}{f('stadiumCapacity', 'Capacity', { type: 'number', min: 0 })}
      {f('homeFieldRating', 'Home-field rating (0-100)', { type: 'number', min: 0, max: 100 })}{f('prestige', 'Prestige (1-100)', { type: 'number', min: 1, max: 100 })}
      {f('coachName', 'Head coach (fictional)')}{f('coachRating', 'Coach rating (1-99)', { type: 'number', min: 1, max: 99 })}
      <label><span className="label">Offense</span><select name="offenseScheme" defaultValue={team?.offenseScheme ?? 'spread'} className="input">{OFFENSE_SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABELS[s]}</option>)}</select></label>
      <label><span className="label">Defense</span><select name="defenseScheme" defaultValue={team?.defenseScheme ?? '4-3'} className="input">{DEFENSE_SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABELS[s]}</option>)}</select></label>
      <div className="sm:col-span-2"><Submit>{team ? 'Save changes' : 'Create program'}</Submit></div>
    </ActionForm>
  );
}
