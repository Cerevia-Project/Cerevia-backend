export const ENTITY_TYPES = [
  "employee",
  "team",
  "department",
  "project",
  "milestone",
  "task",
  "issue",
  "document",
  "meeting",
  "decision",
  "customer",
  "ticket",
  "policy",
  "system",
  "action_item",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** PascalCase FalkorDB node labels (public entity labels + internal labels). */
export const NODE_LABELS = [
  "Organization",
  "Department",
  "Team",
  "Employee",
  "Project",
  "Milestone",
  "Task",
  "Issue",
  "Document",
  "DocumentVersion",
  "Chunk",
  "Meeting",
  "Decision",
  "Customer",
  "Ticket",
  "Policy",
  "System",
  "ActionItem",
  "Expertise",
] as const;

export const typeToLabel: Record<EntityType, string> = {
  employee: "Employee",
  team: "Team",
  department: "Department",
  project: "Project",
  milestone: "Milestone",
  task: "Task",
  issue: "Issue",
  document: "Document",
  meeting: "Meeting",
  decision: "Decision",
  customer: "Customer",
  ticket: "Ticket",
  policy: "Policy",
  system: "System",
  action_item: "ActionItem",
};

export const labelToType: Record<string, EntityType> = {
  Employee: "employee",
  Team: "team",
  Department: "department",
  Project: "project",
  Milestone: "milestone",
  Task: "task",
  Issue: "issue",
  Document: "document",
  Meeting: "meeting",
  Decision: "decision",
  Customer: "customer",
  Ticket: "ticket",
  Policy: "policy",
  System: "system",
  ActionItem: "action_item",
};

export const RELATIONSHIP_TYPES = [
  "BELONGS_TO_TEAM",
  "OWNS",
  "HAS_EXPERTISE_IN",
  "CONTAINS_TASK",
  "DEPENDS_ON",
  "DESCRIBES",
  "PRODUCED_DECISION",
  "AFFECTS",
  "APPROVED_BY",
  "RELATES_TO",
  "ASSIGNED_TO",
  "SUPERSEDES",
  "BLOCKS",
  "MENTIONS",
  "RESPONSIBLE_FOR",
  "COMMITTED_TO",
  "SUPPORTED_BY",
  "HAS_CHUNK",
] as const;

export const CHUNK_LABEL = "Chunk";
export const DOCUMENT_LABEL = "Document";
