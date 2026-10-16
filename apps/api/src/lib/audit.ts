import { query } from "../db/postgres.js";
import { newId } from "./ids.js";

export interface AuditEvent {
  orgId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function auditLog(event: AuditEvent): Promise<void> {
  await query(
    `INSERT INTO audit_log (id, org_id, actor_user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      newId("aud"),
      event.orgId,
      event.actorUserId ?? null,
      event.action,
      event.resourceType,
      event.resourceId ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
