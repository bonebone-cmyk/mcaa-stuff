import type { Tx } from '../db';
import { DEFAULT_SIM_SETTINGS, type SimSettings } from '../sim/types';
import { DEFAULT_RULES, type RecruitingRules } from '../recruiting/engine';

export interface UniverseSettings {
  name: string;
  currentSeasonId: string | null;
  allowAssistantCoaches: boolean;
  allowOwnerLore: boolean;
  commentsEnabled: boolean;
  simSettings: SimSettings;
  recruitingRules: RecruitingRules;
}

export async function getSettings(sql: Tx): Promise<UniverseSettings> {
  const [row] = await sql`select * from universe_settings where id = 1`;
  if (!row) throw new Error('universe_settings row missing — run migrations');
  return {
    name: row.name,
    currentSeasonId: row.currentSeasonId,
    allowAssistantCoaches: row.allowAssistantCoaches,
    allowOwnerLore: row.allowOwnerLore,
    commentsEnabled: row.commentsEnabled,
    simSettings: { ...DEFAULT_SIM_SETTINGS, ...(row.simSettings ?? {}) },
    recruitingRules: { ...DEFAULT_RULES, ...(row.recruitingRules ?? {}), costs: { ...DEFAULT_RULES.costs, ...(row.recruitingRules?.costs ?? {}) } },
  };
}
