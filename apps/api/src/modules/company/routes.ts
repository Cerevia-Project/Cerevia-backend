import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/postgres.js";
import { pathParam } from "../../lib/params.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import * as repo from "./repository.js";

const read = [requireAuth, requirePermission("documents:read")] as const;

export const projectsRouter = Router();
export const risksRouter = Router();
export const decisionsRouter = Router();
export const peopleRouter = Router();
export const teamsRouter = Router();
export const expertiseRouter = Router();
export const conflictsRouter = Router();

projectsRouter.get("/", ...read, async (req, res) => {
  res.json({ items: await repo.listProjects(req.ctx!.orgId), nextCursor: null });
});

projectsRouter.get("/:id", ...read, async (req, res) => {
  const project = await repo.getProject(req.ctx!.orgId, pathParam(req, "id"));
  if (!project) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Project not found" });
  res.json(project);
});

projectsRouter.get("/:id/tasks", ...read, async (req, res) => {
  res.json({ items: await repo.listProjectTasks(req.ctx!.orgId, pathParam(req, "id")), nextCursor: null });
});

projectsRouter.get("/:id/dependencies", ...read, async (req, res) => {
  res.json(await repo.getProjectDependencies(req.ctx!.orgId, pathParam(req, "id")));
});

projectsRouter.get("/:id/risks", ...read, async (req, res) => {
  res.json({ items: await repo.listProjectRisks(req.ctx!.orgId, pathParam(req, "id")) });
});

projectsRouter.get("/:id/launch-readiness", ...read, async (req, res) => {
  res.json(await repo.getLaunchReadiness(req.ctx!.orgId, pathParam(req, "id")));
});

risksRouter.get("/", ...read, async (req, res) => {
  const projects = await repo.listProjects(req.ctx!.orgId);
  const items = [];
  for (const p of projects) {
    items.push(...(await repo.listProjectRisks(req.ctx!.orgId, p.id)));
  }
  res.json({ items });
});

decisionsRouter.get("/", ...read, async (req, res) => {
  res.json({ items: await repo.listDecisions(req.ctx!.orgId), nextCursor: null });
});

decisionsRouter.get("/:id", ...read, async (req, res) => {
  const decision = await repo.getDecision(req.ctx!.orgId, pathParam(req, "id"));
  if (!decision) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Decision not found" });
  res.json(decision);
});

decisionsRouter.get("/:id/revisions", ...read, (_req, res) => {
  res.json({ items: [] });
});

decisionsRouter.get("/:id/trace", ...read, (_req, res) => {
  res.json({ paths: [], citations: [], validity: "unclear" });
});

peopleRouter.get("/", ...read, async (req, res) => {
  res.json({ items: await repo.listPeople(req.ctx!.orgId), nextCursor: null });
});

peopleRouter.get("/:id", ...read, async (req, res) => {
  const person = await repo.getPerson(req.ctx!.orgId, pathParam(req, "id"));
  if (!person) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Person not found" });
  res.json(person);
});

teamsRouter.get("/", ...read, async (req, res) => {
  res.json({ items: await repo.listTeams(req.ctx!.orgId), nextCursor: null });
});

teamsRouter.get("/:id", ...read, async (req, res) => {
  const team = await repo.getTeam(req.ctx!.orgId, pathParam(req, "id"));
  if (!team) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Team not found" });
  res.json(team);
});

expertiseRouter.get("/search", ...read, async (req, res) => {
  const { topic } = validate(z.object({ topic: z.string().min(1) }), req.query);
  res.json({ items: await repo.searchExpertise(req.ctx!.orgId, topic) });
});

conflictsRouter.get("/", ...read, async (req, res) => {
  res.json({ items: await repo.listConflicts(req.ctx!.orgId), nextCursor: null });
});

conflictsRouter.get("/:id", ...read, async (req, res) => {
  const conflict = await repo.getConflict(req.ctx!.orgId, pathParam(req, "id"));
  if (!conflict) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Conflict not found" });
  res.json(conflict);
});

conflictsRouter.patch("/:id", requireAuth, requirePermission("conflicts:resolve"), async (req, res) => {
  const { status, note } = validate(
    z.object({ status: z.enum(["open", "needs_review", "resolved"]).optional(), note: z.string().optional() }),
    req.body,
  );
  const conflict = await repo.getConflict(req.ctx!.orgId, pathParam(req, "id"));
  if (!conflict) return res.status(404).json({ status: 404, code: "NOT_FOUND", detail: "Conflict not found" });

  // Persist the reviewer decision to Postgres (upsert).
  await query(
    `INSERT INTO conflicts (id, org_id, kind, entities, sides, relationship, status, note)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
    [
      conflict.id,
      req.ctx!.orgId,
      conflict.kind,
      JSON.stringify(conflict.entities),
      JSON.stringify(conflict.sides),
      conflict.relationship,
      status ?? conflict.status,
      note ?? null,
    ],
  );

  res.json({ ...conflict, status: status ?? conflict.status, note: note ?? conflict.note });
});

export default projectsRouter;
