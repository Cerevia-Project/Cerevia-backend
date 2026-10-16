import express from "express";
import { authenticate } from "./middleware/auth.js";
import { cors } from "./middleware/cors.js";
import { csrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import actionsRouter from "./modules/actions/routes.js";
import adminRouter from "./modules/admin/routes.js";
import auditRouter from "./modules/audit/routes.js";
import authRouter from "./modules/auth/routes.js";
import {
  conflictsRouter,
  decisionsRouter,
  expertiseRouter,
  peopleRouter,
  projectsRouter,
  risksRouter,
  teamsRouter,
} from "./modules/company/routes.js";
import conversationsRouter, { messagesRouter } from "./modules/conversations/routes.js";
import demoRouter from "./modules/demo/routes.js";
import documentsRouter from "./modules/documents/routes.js";
import graphRouter from "./modules/graph/routes.js";
import ingestionRouter from "./modules/ingestion/routes.js";
import sourcesRouter from "./modules/sources/routes.js";
import healthRouter from "./routes/health.js";

export function createApp() {
  const app = express();

  app.use(cors);
  app.use(requestId);
  app.use(express.json());
  app.use(authenticate);
  app.use(csrf);
  app.use(rateLimit());

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/sources", sourcesRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/ingestion/jobs", ingestionRouter);
  app.use("/api/v1/graph", graphRouter);
  app.use("/api/v1/conversations", conversationsRouter);
  app.use("/api/v1/messages", messagesRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1/risks", risksRouter);
  app.use("/api/v1/decisions", decisionsRouter);
  app.use("/api/v1/people", peopleRouter);
  app.use("/api/v1/teams", teamsRouter);
  app.use("/api/v1/expertise", expertiseRouter);
  app.use("/api/v1/conflicts", conflictsRouter);
  app.use("/api/v1/demo", demoRouter);
  app.use("/api/v1/actions/proposals", actionsRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(healthRouter);

  app.use(errorHandler);

  return app;
}
