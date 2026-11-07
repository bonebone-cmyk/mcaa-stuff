import { ActionForm, Submit } from '@/components/action-form';
import { Card } from '@/components/ui';
import { importAction } from '../actions';

const SAMPLE = `{
  "teams": [{ "school": "Gulf Coast Tech", "mascot": "Marlins", "abbreviation": "GCT", "conference": "sun-belt",
              "primaryColor": "#0a6aa1", "secondaryColor": "#f2c200", "stadium": "Harbor Field", "capacity": 32000, "prestige": 45 }],
  "players": [{ "team": "gulf-coast-tech", "firstName": "Riley", "lastName": "Shore", "position": "QB", "overall": 72, "potential": 84, "stars": 3, "seasonsPlayed": 1 }]
}`;

export default function DataPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Export / Backup">
        <p className="mb-3 text-sm text-muted">Download the universe as JSON (teams, conferences, seasons, games, statistics, players, recruits, rankings, articles, audit log). Store it somewhere safe — combined with Supabase’s automatic backups this is your portable archive.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/commissioner/export" className="btn-primary">Download full export</a>
          <a href="/commissioner/export?scope=core" className="btn-ghost">Teams & players only</a>
        </div>
      </Card>
      <Card title="Import">
        <p className="mb-3 text-sm text-muted">Upsert teams (by slug) and add players from JSON. Rosters receive auto depth charts and ratings refresh.</p>
        <ActionForm action={importAction} className="space-y-3">
          <input type="file" name="file" accept="application/json" className="text-sm" />
          <textarea name="json" rows={10} placeholder={SAMPLE} className="input font-mono text-xs" />
          <Submit>Import</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
