import type { SessionUser, TenantContext } from "../lib/tenant.js";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      ctx?: TenantContext;
      csrfToken?: string;
      orgName?: string;
    }
  }
}

export {};
