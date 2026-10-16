import { randomUUID } from "node:crypto";

/**
 * Opaque, prefixed IDs (e.g. `org_...`, `doc_...`). Clients must not parse them.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
