import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getCookie } from "../../lib/cookies.js";
import { validate } from "../../lib/validate.js";
import { authenticate, requireAuth } from "../../middleware/auth.js";
import { login, logout } from "./service.js";

const router = Router();

const crossOrigin = env.frontendOrigin !== "";
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.nodeEnv === "production" || crossOrigin,
  sameSite: crossOrigin ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
} as const;

router.post("/login", async (req, res) => {
  const { email, password } = validate(
    z.object({ email: z.string().email(), password: z.string().min(1) }),
    req.body,
  );

  const result = await login(email, password);

  res.cookie("sid", result.sessionId, SESSION_COOKIE_OPTIONS);
  res.json({
    user: result.user,
    organization: { id: result.orgId, name: result.orgName },
    roles: result.roles,
    permissions: result.permissions,
    csrfToken: result.csrfToken,
  });
});

router.post("/logout", authenticate, async (req, res) => {
  const sid = getCookie(req, "sid");
  if (sid) {
    await logout(sid);
  }
  res.clearCookie("sid", { path: "/" });
  res.status(204).end();
});

router.get("/session", authenticate, requireAuth, (req, res) => {
  res.json({
    user: req.user,
    organization: { id: req.ctx!.orgId, name: req.orgName ?? "" },
    roles: req.ctx!.roles,
    permissions: [...req.ctx!.permissions],
    csrfToken: req.csrfToken,
  });
});

router.get("/csrf", authenticate, requireAuth, (req, res) => {
  res.json({ csrfToken: req.csrfToken });
});

export default router;
