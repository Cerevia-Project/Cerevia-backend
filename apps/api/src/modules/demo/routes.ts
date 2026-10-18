import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { loadDemoData } from "./loader.js";

const router = Router();

router.post("/load", requireAuth, requirePermission("demo:load"), async (req, res) => {
  await loadDemoData(req.ctx!.orgId);
  // The loader writes straight to the graph, so there are no ingestion jobs to report.
  res.status(202).json({ jobs: [] });
});

export default router;
