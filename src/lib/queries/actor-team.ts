import 'server-only';
import type { Actor } from '../auth/permissions';

/** The team a signed-in coach manages (primary ownership first) */
export function actorTeamId(actor: Actor | null): string | null {
  return actor ? actor.ownedTeamIds[0] ?? actor.assistantTeamIds[0] ?? null : null;
}
