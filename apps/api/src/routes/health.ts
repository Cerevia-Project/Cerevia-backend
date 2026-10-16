import { Router } from "express";
import { connectDB } from "../db/falkordb.js";

const router = Router();

// Legacy health check (kept for backward compatibility).
router.get("/ping", async (_req, res) => {
  try {
    const graph = await connectDB();
    await graph.query("RETURN 1 AS ok");
    res.json({ status: "success", message: "Express and FalkorDB are connected" });
  } catch (error) {
    console.error("FalkorDB connection/query failed:", error);
    res.status(500).json({ status: "error", message: "Could not connect to FalkorDB" });
  }
});

// Contract: GET /health → { status: "ok" }, verifies the FalkorDB connection.
router.get("/health", async (_req, res) => {
  try {
    const graph = await connectDB();
    await graph.query("RETURN 1 AS ok");
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ status: "error" });
  }
});

// Contract: GET /version → { version }.
router.get("/version", (_req, res) => {
  res.json({ version: "1.0.0" });
});

export default router;
