import { getTenantGraph } from "../graph/client.js";
import { labelToType } from "../graph/entities.js";

interface Node {
  labels: string[];
  properties: Record<string, unknown>;
}

interface Edge {
  relationshipType: string;
  properties: Record<string, unknown>;
}

function propsOf(node: Node): Record<string, unknown> {
  const raw = node.properties.props;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
}

/** Read a structured field from a top-level property first, then the props JSON. */
function field(node: Node, key: string): string {
  const direct = node.properties[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const value = propsOf(node)[key];
  return value === undefined || value === null ? "" : String(value);
}

function nodeId(node: Node): string {
  return String(node.properties.id ?? "");
}

function nodeLabel(node: Node): string {
  return String(node.properties.label ?? node.properties.id ?? "");
}

function ref(node: Node) {
  return {
    id: nodeId(node),
    type: labelToType[node.labels[0] ?? ""] ?? (node.labels[0]?.toLowerCase() ?? "unknown"),
    label: nodeLabel(node),
    isSampleData: Boolean(node.properties.isSampleData),
  };
}

async function matchLabel(orgId: string, label: string, limit = 50): Promise<Node[]> {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: Node }>(
    `MATCH (n:${label}) WHERE n.orgId = $orgId RETURN n LIMIT $limit`,
    { params: { orgId, limit } },
  );
  return (result.data ?? []).map((row) => row.n);
}

// ── Projects ─────────────────────────────────────────────────────────
export async function listProjects(orgId: string) {
  const nodes = await matchLabel(orgId, "Project");
  return nodes.map((n) => ({
    id: nodeId(n),
    label: nodeLabel(n),
    status: field(n, "status") || "unknown",
    riskLevel: field(n, "riskLevel") || "unknown",
    isSampleData: Boolean(n.properties.isSampleData),
  }));
}

export async function getProject(orgId: string, id: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: Node }>(
    "MATCH (n:Project {orgId: $orgId, id: $id}) RETURN n LIMIT 1",
    { params: { orgId, id } },
  );
  const project = result.data?.[0]?.n;
  if (!project) return null;

  const related = await graph.query<{ m: Node }>(
    "MATCH (p:Project {orgId: $orgId, id: $id})-[r]-(m {orgId: $orgId}) RETURN m LIMIT 50",
    { params: { orgId, id } },
  );
  const relatedNodes = (related.data ?? []).map((row) => row.m);

  const p = propsOf(project);
  return {
    ...ref(project),
    status: field(project, "status") || "unknown",
    riskLevel: field(project, "riskLevel") || "unknown",
    milestones: relatedNodes.filter((m) => m.labels.includes("Milestone")).map(ref),
    owners: relatedNodes.filter((m) => m.labels.includes("Employee")).map(ref),
    documents: relatedNodes.filter((m) => m.labels.includes("Document")).map(ref),
  };
}

export async function listProjectTasks(orgId: string, projectId: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ t: Node }>(
    "MATCH (p:Project {orgId: $orgId, id: $projectId})-[r]-(t:Task {orgId: $orgId}) RETURN t LIMIT 100",
    { params: { orgId, projectId } },
  );
  return (result.data ?? []).map((row) => ref(row.t));
}

export async function getProjectDependencies(orgId: string, projectId: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ m: Node; r: Edge }>(
    "MATCH (p:Project {orgId: $orgId, id: $projectId})-[r]-(m {orgId: $orgId}) WHERE type(r) IN ['DEPENDS_ON', 'BLOCKS'] RETURN m, r LIMIT 50",
    { params: { orgId, projectId } },
  );
  const nodeById = new Map<string, Node>();
  const edges: Record<string, unknown>[] = [];
  for (const row of result.data ?? []) {
    nodeById.set(nodeId(row.m), row.m);
    edges.push({
      id: String(row.r.properties.id ?? ""),
      type: row.r.relationshipType,
      from: String(row.r.properties.fromId ?? ""),
      to: String(row.r.properties.toId ?? ""),
      current: Boolean(row.r.properties.current),
    });
  }
  return { nodes: [...nodeById.values()].map(ref), edges, truncated: false };
}

export async function listProjectRisks(orgId: string, projectId: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ t: Node }>(
    `MATCH (p:Project {orgId: $orgId, id: $projectId})-[r]-(t {orgId: $orgId})
     WHERE t.status = 'blocked' OR t.status = 'at_risk' OR t.status = 'overdue'
     RETURN t LIMIT 50`,
    { params: { orgId, projectId } },
  );
  return (result.data ?? []).map((row) => ({
    id: nodeId(row.t),
    title: nodeLabel(row.t),
    kind: field(row.t, "kind") || "confirmed",
    severity: field(row.t, "severity") || "high",
    rationale: field(row.t, "rationale"),
    claims: [],
    citations: [],
  }));
}

export async function getLaunchReadiness(orgId: string, projectId: string) {
  const risks = await listProjectRisks(orgId, projectId);
  const verdict = risks.length === 0 ? "ready" : "at_risk";
  return {
    verdict,
    summary: `${risks.length} open risk(s) found.`,
    claims: [],
    citations: [],
  };
}

// ── Decisions ────────────────────────────────────────────────────────
export async function listDecisions(orgId: string) {
  const nodes = await matchLabel(orgId, "Decision");
  return nodes.map((n) => ({
    id: nodeId(n),
    title: nodeLabel(n),
    date: field(n, "date"),
    status: field(n, "status") || "unknown",
    owner: undefined,
    isSampleData: Boolean(n.properties.isSampleData),
  }));
}

export async function getDecision(orgId: string, id: string) {
  const nodes = await matchLabel(orgId, "Decision");
  const decision = nodes.find((n) => nodeId(n) === id);
  if (!decision) return null;
  return {
    id: nodeId(decision),
    title: nodeLabel(decision),
    date: field(decision, "date"),
    status: field(decision, "status") || "unknown",
    owner: undefined,
    rationale: field(decision, "rationale"),
    alternatives: safeParseArray(field(decision, "alternatives")),
    affectedEntities: [],
    citations: [],
  };
}

function safeParseArray(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// ── People & teams ───────────────────────────────────────────────────
export async function listPeople(orgId: string) {
  const nodes = await matchLabel(orgId, "Employee");
  return nodes.map(ref);
}

export async function getPerson(orgId: string, id: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: Node }>(
    "MATCH (n:Employee {orgId: $orgId, id: $id}) RETURN n LIMIT 1",
    { params: { orgId, id } },
  );
  const person = result.data?.[0]?.n;
  if (!person) return null;

  const related = await graph.query<{ m: Node; r: Edge }>(
    "MATCH (n:Employee {orgId: $orgId, id: $id})-[r]-(m {orgId: $orgId}) RETURN m, r LIMIT 50",
    { params: { orgId, id } },
  );
  const rows = related.data ?? [];
  return {
    ...ref(person),
    memberships: rows.filter((x) => x.r.relationshipType === "BELONGS_TO_TEAM").map((x) => ref(x.m)),
    responsibilities: rows
      .filter((x) => ["OWNS", "RESPONSIBLE_FOR", "ASSIGNED_TO"].includes(x.r.relationshipType))
      .map((x) => ref(x.m)),
    expertise: rows
      .filter((x) => x.r.relationshipType === "HAS_EXPERTISE_IN")
      .map((x) => ({ topic: nodeLabel(x.m), evidence: [] })),
  };
}

export async function listTeams(orgId: string) {
  const nodes = await matchLabel(orgId, "Team");
  return nodes.map(ref);
}

export async function getTeam(orgId: string, id: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: Node }>(
    "MATCH (n:Team {orgId: $orgId, id: $id}) RETURN n LIMIT 1",
    { params: { orgId, id } },
  );
  const team = result.data?.[0]?.n;
  if (!team) return null;

  const members = await graph.query<{ m: Node }>(
    "MATCH (t:Team {orgId: $orgId, id: $id})<-[r:BELONGS_TO_TEAM]-(m:Employee {orgId: $orgId}) RETURN m LIMIT 50",
    { params: { orgId, id } },
  );
  return { id: nodeId(team), label: nodeLabel(team), members: (members.data ?? []).map((x) => ref(x.m)), owned: [] };
}

export async function searchExpertise(orgId: string, topic: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ e: Node; x: Node }>(
    "MATCH (e:Employee {orgId: $orgId})-[r:HAS_EXPERTISE_IN]->(x {orgId: $orgId}) WHERE x.label CONTAINS $topic RETURN e, x LIMIT 50",
    { params: { orgId, topic } },
  );
  return (result.data ?? []).map((row) => ({ person: ref(row.e), score: 1, evidence: [] }));
}

// ── Conflicts ────────────────────────────────────────────────────────
export async function listConflicts(orgId: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: Node; c: Node }>(
    "MATCH (n {orgId: $orgId})-[r:SUPPORTED_BY]->(c:Chunk {orgId: $orgId}) RETURN n, c LIMIT 200",
    { params: { orgId } },
  );
  // Group entity -> its supporting chunks; 2+ distinct passages = a contradiction candidate.
  const byEntity = new Map<string, { node: Node; passages: Set<string>; chunkIds: string[] }>();
  for (const row of result.data ?? []) {
    const id = nodeId(row.n);
    const entry = byEntity.get(id) ?? { node: row.n, passages: new Set<string>(), chunkIds: [] };
    entry.passages.add(String(row.c.properties.text ?? "").slice(0, 200));
    entry.chunkIds.push(String(row.c.properties.id ?? ""));
    byEntity.set(id, entry);
  }
  const conflicts = [];
  for (const { node, passages, chunkIds } of byEntity.values()) {
    if (passages.size > 1) {
      conflicts.push({
        id: `cfl_${nodeId(node)}`,
        kind: "contradiction",
        entities: [ref(node)],
        sides: [...passages].map((passage) => ({ citation: { id: "", passage }, date: "", approvalStatus: "unknown", authority: "" })),
        relationship: "supported-by",
        status: "needs_review",
        note: null,
      });
    }
  }
  return conflicts;
}

export async function getConflict(orgId: string, id: string) {
  const conflicts = await listConflicts(orgId);
  return conflicts.find((c) => c.id === id) ?? null;
}
