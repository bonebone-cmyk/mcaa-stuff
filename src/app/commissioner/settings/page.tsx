import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Card } from '@/components/ui';
import { getSettings } from '@/lib/services/settings';
import { rebuildDepthChartsAction, saveUniverseSettingsAction } from '../actions';
import { SimSliders } from './sliders';

export default async function SettingsPage() {
  const s = await getSettings(getSql());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Simulation Engine">
        <p className="mb-4 text-sm text-muted">50 is the calibrated default. Higher upset/randomness widens outcomes so underdogs win more often; ratings still matter. Settings are stored with each simulated game.</p>
        <SimSliders initial={s.simSettings} />
      </Card>
      <div className="space-y-6">
        <Card title="Universe">
          <ActionForm action={saveUniverseSettingsAction} className="space-y-3">
            <label className="block"><span className="label">Universe name</span><input name="name" defaultValue={s.name} className="input" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowAssistantCoaches" defaultChecked={s.allowAssistantCoaches} /> Allow assistant coaches</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowOwnerLore" defaultChecked={s.allowOwnerLore} /> Team owners may publish lore for their programs</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="commentsEnabled" defaultChecked={s.commentsEnabled} /> Enable article comments</label>
            <Submit>Save</Submit>
          </ActionForm>
        </Card>
        <Card title="Maintenance">
          <ActionForm action={rebuildDepthChartsAction} confirm="Rebuild depth charts for all computer-controlled teams?">
            <Submit className="btn-ghost">Rebuild AI depth charts & refresh ratings</Submit>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
