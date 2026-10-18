import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { getOverview } from "./repository.js";

const router = Router();

router.get("/", requireAuth, requirePermission("documents:read"), async (req, res) => {
  res.json(await getOverview(req.ctx!.orgId));
});

export default router;
