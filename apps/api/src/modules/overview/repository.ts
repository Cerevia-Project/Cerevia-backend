/** Overview aggregates: system-of-record counts from Postgres, organization counts from the tenant graph. */

import { query } from "../../db/postgres.js";
import { getTenantGraph } from "../graph/client.js";
import { labelToType } from "../graph/entities.js";

interface GraphNode {
  labels: string[];
  properties: Record<string, unknown>;
}

const ENTITY_LABELS = [
  "Department",
  "Team",
  "Employee",
  "Project",
  "Milestone",
  "Task",
  "Issue",
  "Document",
  "Meeting",
  "Decision",
  "Customer",
  "Ticket",
  "Policy",
  "System",
  "ActionItem",
] as const;

function toRef(node: GraphNode) {
  return {
    id: String(node.properties.id ?? ""),
    type: labelToType[node.labels[0] ?? ""] ?? "document",
    label: String(node.properties.label ?? node.properties.id ?? ""),
    isSampleData: Boolean(node.properties.isSampleData),
  };
}

async function countLabel(orgId: string, label: string): Promise<number> {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ total: number }>(
    `MATCH (n:${label}) WHERE n.orgId = $orgId RETURN count(n) AS total`,
    { params: { orgId } },
  );
  return Number(result.data?.[0]?.total ?? 0);
}

async function recentByLabel(orgId: string, label: string, limit: number): Promise<GraphNode[]> {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: GraphNode }>(
    `MATCH (n:${label}) WHERE n.orgId = $orgId
     RETURN n ORDER BY n.updatedAt DESC LIMIT $limit`,
    { params: { orgId, limit } },
  );
  return (result.data ?? []).map((row) => row.n);
}

async function openBlockers(orgId: string, limit: number): Promise<GraphNode[]> {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: GraphNode }>(
    `MATCH (n) WHERE n.orgId = $orgId AND (n:Task OR n:Issue) AND n.status = 'blocked'
     RETURN n ORDER BY n.updatedAt DESC LIMIT $limit`,
    { params: { orgId, limit } },
  );
  return (result.data ?? []).map((row) => row.n);
}

async function recentlyUpdated(orgId: string, limit: number): Promise<GraphNode[]> {
  const graph = await getTenantGraph(orgId);
  // Chunks and document versions churn on every ingest, so they are left out.
  const labelFilter = ENTITY_LABELS.map((label) => `n:${label}`).join(" OR ");
  const result = await graph.query<{ n: GraphNode }>(
    `MATCH (n) WHERE n.orgId = $orgId AND (${labelFilter})
     RETURN n ORDER BY n.updatedAt DESC LIMIT $limit`,
    { params: { orgId, limit } },
  );
  return (result.data ?? []).map((row) => row.n);
}

async function hasSampleData(orgId: string): Promise<boolean> {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ total: number }>(
    "MATCH (n) WHERE n.orgId = $orgId AND n.isSampleData = true RETURN count(n) AS total LIMIT 1",
    { params: { orgId } },
  );
  return Number(result.data?.[0]?.total ?? 0) > 0;
}

export interface Overview {
  sources: number;
  documents: number;
  people: number;
  teams: number;
  projects: number;
  recentDecisions: ReturnType<typeof toRef>[];
  openBlockers: ReturnType<typeof toRef>[];
  recentlyUpdated: ReturnType<typeof toRef>[];
  ingestion: { succeeded: number; failed: number; inProgress: number };
  alerts: string[];
  sampleDataNotice: boolean;
}

export async function getOverview(orgId: string): Promise<Overview> {
  const [sourceCounts, documentCount, ingestion] = await Promise.all([
    query<{ total: string; errored: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE state = 'error') AS errored
       FROM sources WHERE org_id = $1`,
      [orgId],
    ),
    query<{ total: string }>("SELECT count(*) AS total FROM documents WHERE org_id = $1", [orgId]),
    query<{ succeeded: string; failed: string; in_progress: string }>(
      `SELECT count(*) FILTER (WHERE status = 'done')                       AS succeeded,
              count(*) FILTER (WHERE status = 'failed')                     AS failed,
              count(*) FILTER (WHERE status IN ('queued', 'running'))       AS in_progress
       FROM ingestion_jobs WHERE org_id = $1`,
      [orgId],
    ),
  ]);

  const [people, teams, projects, decisions, blockers, updated, sampleData] = await Promise.all([
    countLabel(orgId, "Employee"),
    countLabel(orgId, "Team"),
    countLabel(orgId, "Project"),
    recentByLabel(orgId, "Decision", 5),
    openBlockers(orgId, 5),
    recentlyUpdated(orgId, 5),
    hasSampleData(orgId),
  ]);

  const failedJobs = Number(ingestion.rows[0]?.failed ?? 0);
  const erroredSources = Number(sourceCounts.rows[0]?.errored ?? 0);

  const alerts: string[] = [];
  if (failedJobs > 0) {
    alerts.push(
      `${failedJobs} ingestion ${failedJobs === 1 ? "job" : "jobs"} failed and ${
        failedJobs === 1 ? "has" : "have"
      } not been retried.`,
    );
  }
  if (erroredSources > 0) {
    alerts.push(
      `${erroredSources} ${erroredSources === 1 ? "source is" : "sources are"} in an error state.`,
    );
  }

  return {
    sources: Number(sourceCounts.rows[0]?.total ?? 0),
    documents: Number(documentCount.rows[0]?.total ?? 0),
    people,
    teams,
    projects,
    recentDecisions: decisions.map(toRef),
    openBlockers: blockers.map(toRef),
    recentlyUpdated: updated.map(toRef),
    ingestion: {
      succeeded: Number(ingestion.rows[0]?.succeeded ?? 0),
      failed: failedJobs,
      inProgress: Number(ingestion.rows[0]?.in_progress ?? 0),
    },
    alerts,
    sampleDataNotice: sampleData,
  };
}
