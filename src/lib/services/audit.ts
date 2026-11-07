import type { Tx } from '../db';

export async function logAudit(sql: Tx, actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await sql`insert into audit_log (actor_id, action, entity_type, entity_id, details)
            values (${actorId}, ${action}, ${entityType}, ${entityId}, ${sql.json(details as any)})`;
}
