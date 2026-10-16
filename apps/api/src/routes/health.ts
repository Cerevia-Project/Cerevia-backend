import { Router } from "express";
import type { Request, Response } from "express";
import { connectDB } from "../db/falkordb.js";

const router = Router();

router.get("/ping", async (_req: Request, res: Response) => {
  try {
    const graph = await connectDB();

    // Run a harmless query to verify the graph is accessible.
    await graph.query("RETURN 1 AS ok");

    res.json({
      status: "success",
      message: "Express and FalkorDB are connected",
    });
  } catch (error) {
    console.error("FalkorDB connection/query failed:", error);

    res.status(500).json({
      status: "error",
      message: "Could not connect to FalkorDB",
    });
  }
});

export default router;
