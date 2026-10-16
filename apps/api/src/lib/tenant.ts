export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * The tenant context that every repository call must receive. Derived from the
 * session, never from client input.
 */
export interface TenantContext {
  orgId: string;
  userId: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  /**
   * Source ids the user may read, or `null` when unrestricted (admin/manager).
   * Populated from source ACLs during retrieval; `null` for org-wide access.
   */
  allowedSourceIds: string[] | null;
}

export function can(ctx: TenantContext, permission: string): boolean {
  return ctx.permissions.has(permission);
}
