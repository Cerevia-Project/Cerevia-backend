import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { loadDemoData } from "./loader.js";

const router = Router();

router.post("/load", requireAuth, requirePermission("demo:load"), async (req, res) => {
  const counts = await loadDemoData(req.ctx!.orgId);
  res.json({ status: "success", data: counts });
});

export default router;
