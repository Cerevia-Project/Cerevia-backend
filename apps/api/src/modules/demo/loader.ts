import { getTenantGraph } from "../graph/client.js";
import { migrateGraphSchema } from "../graph/schema.js";
import { writeEntity, writeRelationship } from "../graph/write.js";

/**
 * Load a compact synthetic company into the tenant graph. Idempotent (MERGE on
 * stable ids). Everything is flagged isSampleData=true.
 */
export async function loadDemoData(orgId: string) {
  const graph = await getTenantGraph(orgId);
  await migrateGraphSchema(graph);

  for (const [id, name] of [
    ["team_payments", "Payments"],
    ["team_platform", "Platform"],
    ["team_support", "Support"],
  ] as const) {
    await writeEntity(graph, { orgId, type: "team", id, name, isSampleData: true });
  }

  for (const [id, name] of [
    ["exp_payments", "Payments"],
    ["exp_platform", "Platform engineering"],
    ["exp_support", "Support"],
  ] as const) {
    await writeEntity(graph, { orgId, type: "Expertise", id, name, isSampleData: true });
  }

  const employees = [
    ["emp_ada", "Ada Lovelace", "team_payments", "exp_payments", "Lead"],
    ["emp_kate", "Katherine Johnson", "team_payments", "exp_payments", "Manager"],
    ["emp_margaret", "Margaret Hamilton", "team_payments", "exp_payments", "Engineer"],
    ["emp_grace", "Grace Hopper", "team_platform", "exp_platform", "Engineer"],
    ["emp_alan", "Alan Turing", "team_platform", "exp_platform", "Engineer"],
    ["emp_linus", "Linus Torvalds", "team_support", "exp_support", "Engineer"],
  ] as const;

  for (const [id, name, teamId, expertiseId, role] of employees) {
    await writeEntity(graph, { orgId, type: "employee", id, name, fields: { role }, isSampleData: true });
    await writeRelationship(graph, {
      orgId,
      type: "BELONGS_TO_TEAM",
      fromLabel: "Employee",
      toLabel: "Team",
      fromId: id,
      toId: teamId,
    });
    await writeRelationship(graph, {
      orgId,
      type: "HAS_EXPERTISE_IN",
      fromLabel: "Employee",
      toLabel: "Expertise",
      fromId: id,
      toId: expertiseId,
    });
  }

  await writeEntity(graph, {
    orgId,
    type: "project",
    id: "prj_launch",
    name: "Payments Launch",
    fields: { status: "at_risk", riskLevel: "high" },
    isSampleData: true,
  });
  await writeEntity(graph, {
    orgId,
    type: "milestone",
    id: "mil_gateway",
    name: "Gateway integration complete",
    fields: { status: "blocked" },
    isSampleData: true,
  });
  await writeEntity(graph, {
    orgId,
    type: "task",
    id: "tsk_gateway",
    name: "Integrate payment gateway",
    fields: { status: "blocked", severity: "high", rationale: "Vendor sign-off pending" },
    isSampleData: true,
  });
  await writeEntity(graph, {
    orgId,
    type: "task",
    id: "tsk_vendor",
    name: "Vendor sign-off",
    fields: { status: "blocked", severity: "high", rationale: "Awaiting vendor confirmation" },
    isSampleData: true,
  });
  await writeEntity(graph, {
    orgId,
    type: "task",
    id: "tsk_checklist",
    name: "Write release checklist",
    fields: { status: "done" },
    isSampleData: true,
  });

  await writeRelationship(graph, {
    orgId, type: "CONTAINS_TASK", fromLabel: "Milestone", toLabel: "Task", fromId: "mil_gateway", toId: "tsk_gateway",
  });
  await writeRelationship(graph, {
    orgId, type: "OWNS", fromLabel: "Employee", toLabel: "Task", fromId: "emp_ada", toId: "tsk_gateway",
  });
  await writeRelationship(graph, {
    orgId, type: "DEPENDS_ON", fromLabel: "Project", toLabel: "Task", fromId: "prj_launch", toId: "tsk_gateway",
  });
  await writeRelationship(graph, {
    orgId, type: "DEPENDS_ON", fromLabel: "Task", toLabel: "Task", fromId: "tsk_gateway", toId: "tsk_vendor",
  });
  await writeRelationship(graph, {
    orgId, type: "RESPONSIBLE_FOR", fromLabel: "Employee", toLabel: "Team", fromId: "emp_kate", toId: "team_payments",
  });

  await writeEntity(graph, {
    orgId,
    type: "decision",
    id: "dec_queue",
    name: "Use queue A over queue B",
    fields: {
      date: "2026-10-01T00:00:00Z",
      status: "approved",
      rationale: "Queue A has stronger retry semantics for the payments pipeline.",
      alternatives: JSON.stringify(["Queue B", "Polling"]),
    },
    isSampleData: true,
  });

  await writeRelationship(graph, {
    orgId, type: "PRODUCED_DECISION", fromLabel: "Employee", toLabel: "Decision",
    fromId: "emp_ada", toId: "dec_queue",
  });
  await writeRelationship(graph, {
    orgId, type: "APPROVED_BY", fromLabel: "Decision", toLabel: "Employee",
    fromId: "dec_queue", toId: "emp_kate",
  });
  await writeRelationship(graph, {
    orgId, type: "AFFECTS", fromLabel: "Decision", toLabel: "Project",
    fromId: "dec_queue", toId: "prj_launch",
  });

  return { teams: 3, employees: employees.length, projects: 1, tasks: 3, decisions: 1 };
}
