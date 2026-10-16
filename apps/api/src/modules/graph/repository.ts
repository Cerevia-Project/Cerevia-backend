import { getTenantGraph } from "./client.js";
import { ENTITY_TYPES, labelToType, RELATIONSHIP_TYPES, typeToLabel } from "./entities.js";

interface FalkorNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface FalkorEdge {
  id: string;
  sourceId: string;
  destinationId: string;
  relationshipType: string;
  properties: Record<string, unknown>;
}

function entityTypeOf(node: FalkorNode): string {
  const first = node.labels[0] ?? "";
  return labelToType[first] ?? first.toLowerCase();
}

function toEntityRef(node: FalkorNode) {
  return {
    id: String(node.properties.id),
    type: entityTypeOf(node),
    label: String(node.properties.label ?? node.properties.id ?? ""),
    isSampleData: Boolean(node.properties.isSampleData),
  };
}

function toGraphNode(node: FalkorNode) {
  const rest = { ...node.properties };
  delete rest.orgId;
  delete rest.id;
  delete rest.label;
  delete rest.isSampleData;
  return {
    id: String(node.properties.id),
    type: entityTypeOf(node),
    label: String(node.properties.label ?? node.properties.id ?? ""),
    properties: rest,
    isSampleData: Boolean(node.properties.isSampleData),
  };
}

function toGraphEdge(edge: FalkorEdge) {
  const { current, confidence, provenance } = edge.properties;
  return {
    id: String(edge.properties.id ?? edge.id),
    type: edge.relationshipType,
    from: String(edge.properties.fromId ?? ""),
    to: String(edge.properties.toId ?? ""),
    validFrom: (edge.properties.validFrom as string | undefined) ?? null,
    validTo: (edge.properties.validTo as string | undefined) ?? null,
    current: Boolean(current),
    provenance: (provenance as unknown[] | undefined) ?? [],
    confidence: Number(confidence ?? 1),
  };
}

export async function searchEntities(orgId: string, q: string, types?: string[]) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: FalkorNode }>(
    "MATCH (n) WHERE n.orgId = $orgId AND n.label CONTAINS $q RETURN n LIMIT 50",
    { params: { orgId, q } },
  );

  let entities = (result.data ?? [])
    .map((row) => row.n)
    .filter((n) => labelToType[n.labels[0] ?? ""] !== undefined)
    .map(toEntityRef);

  if (types?.length) {
    entities = entities.filter((e) => types.includes(e.type));
  }
  return entities;
}

export async function getEntity(orgId: string, id: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ n: FalkorNode }>(
    "MATCH (n {orgId: $orgId, id: $id}) RETURN n LIMIT 1",
    { params: { orgId, id } },
  );
  const node = result.data?.[0]?.n;
  if (!node) return null;
  // Provenance fills in once extraction writes SUPPORTED_BY edges (B2 live path).
  return { ...toGraphNode(node), provenance: [] };
}

export async function getNeighbors(
  orgId: string,
  id: string,
  edgeTypes: string[] | undefined,
  direction: "in" | "out" | "both",
  limit: number,
) {
  const graph = await getTenantGraph(orgId);
  const pattern =
    direction === "in" ? `<-[r]-` : direction === "out" ? `-[r]->` : `-[r]-`;
  const typeFilter = edgeTypes?.length ? " AND type(r) IN $edgeTypes" : "";
  const result = await graph.query<{ m: FalkorNode; r: FalkorEdge }>(
    `MATCH (n {orgId: $orgId, id: $id})${pattern}(m {orgId: $orgId})
     WHERE true${typeFilter}
     RETURN m, r
     LIMIT $limit`,
    { params: { orgId, id, limit, edgeTypes: edgeTypes ?? [] } },
  );

  const nodeById = new Map<string, FalkorNode>();
  const edges: FalkorEdge[] = [];
  for (const row of result.data ?? []) {
    if (row.m) nodeById.set(String(row.m.properties.id), row.m);
    if (row.r) edges.push(row.r);
  }
  const nodes = [...nodeById.values()].map(toGraphNode);
  return { nodes, edges: edges.map(toGraphEdge), truncated: edges.length >= limit };
}

export async function getEdge(orgId: string, id: string) {
  const graph = await getTenantGraph(orgId);
  const result = await graph.query<{ r: FalkorEdge }>(
    "MATCH ()-[r]-() WHERE r.orgId = $orgId AND r.id = $id RETURN r LIMIT 1",
    { params: { orgId, id } },
  );
  const edge = result.data?.[0]?.r;
  return edge ? toGraphEdge(edge) : null;
}

export function getSchema() {
  return {
    entityTypes: ENTITY_TYPES.map((type) => ({ type, label: typeToLabel[type], colorKey: type })),
    edgeTypes: RELATIONSHIP_TYPES.map((type) => ({ type, label: type.toLowerCase() })),
  };
}
