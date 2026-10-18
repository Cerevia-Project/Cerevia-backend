import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { CONNECTOR_CATALOG } from "./catalog.js";

const router = Router();

router.get("/", requireAuth, requirePermission("sources:read"), (_req, res) => {
  res.json({ items: CONNECTOR_CATALOG });
});

export default router;
