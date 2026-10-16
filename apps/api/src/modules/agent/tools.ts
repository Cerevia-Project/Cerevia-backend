import type Anthropic from "@anthropic-ai/sdk";
import * as companyRepo from "../company/repository.js";
import * as graphRepo from "../graph/repository.js";
import { hybridSearch } from "../retrieval/search.js";

export interface ToolContext {
  orgId: string;
  userId: string;
}

export interface ToolDef {
  tool: Anthropic.Tool;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const str = (input: Record<string, unknown>, key: string): string => String(input[key] ?? "");

export const tools: ToolDef[] = [
  {
    tool: {
      name: "search_documents",
      description:
        "Search ingested document chunks (hybrid keyword + vector). Returns matching passages with chunkId and documentId.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => {
      const hits = await hybridSearch(ctx.orgId, str(input, "query"), 6);
      return {
        hits: hits.map((h) => ({
          citationId: `cit_${h.chunkId}`,
          chunkId: h.chunkId,
          documentId: h.documentId,
          documentTitle: h.documentTitle,
          text: h.text,
          score: h.score,
        })),
      };
    },
  },
  {
    tool: {
      name: "search_entities",
      description: "Search the knowledge graph for entities by name or label.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => graphRepo.searchEntities(ctx.orgId, str(input, "query")),
  },
  {
    tool: {
      name: "get_entity_details",
      description: "Get an entity's properties and provenance by id.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => graphRepo.getEntity(ctx.orgId, str(input, "id")),
  },
  {
    tool: {
      name: "traverse_relationships",
      description: "Expand an entity's neighbors in the knowledge graph.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string" },
          direction: { type: "string", enum: ["in", "out", "both"] },
        },
      },
      strict: true,
    },
    handler: async (input, ctx) => {
      const direction = (input.direction === "in" || input.direction === "out" ? input.direction : "both") as
        | "in"
        | "out"
        | "both";
      return graphRepo.getNeighbors(ctx.orgId, str(input, "id"), undefined, direction, 25);
    },
  },
  {
    tool: {
      name: "get_project_status",
      description: "Get a project's status, milestones, owners and documents.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: { projectId: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => companyRepo.getProject(ctx.orgId, str(input, "projectId")),
  },
  {
    tool: {
      name: "search_decisions",
      description: "Search past decisions by title.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => {
      const decisions = await companyRepo.listDecisions(ctx.orgId);
      const q = str(input, "query").toLowerCase();
      return decisions.filter((d) => d.title.toLowerCase().includes(q));
    },
  },
  {
    tool: {
      name: "find_expertise",
      description: "Find people by area of expertise.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["topic"],
        properties: { topic: { type: "string" } },
      },
      strict: true,
    },
    handler: async (input, ctx) => companyRepo.searchExpertise(ctx.orgId, str(input, "topic")),
  },
];

export function getToolDef(name: string): ToolDef | undefined {
  return tools.find((t) => t.tool.name === name);
}
