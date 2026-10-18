import { query } from "../../db/postgres.js";
import { AppError } from "../../lib/errors.js";
import { getLlmProvider, type LlmTool, type LlmToolResult } from "../llm/index.js";
import { getToolDef, tools, type ToolContext } from "./tools.js";

function requireProvider() {
  const provider = getLlmProvider();
  if (!provider.isConfigured) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `The assistant is not configured in this environment (provider: ${provider.name}).`,
    );
  }
  return provider;
}

/** Maps provider failures to AI_UNAVAILABLE, logging the original for operators. */
function asAgentError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  console.error("Agent call failed:", error);
  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) {
    return new AppError("AI_UNAVAILABLE", "The assistant's credentials were rejected.");
  }
  if (status === 429) {
    return new AppError("AI_UNAVAILABLE", "The assistant is rate limited. Try again shortly.");
  }
  if (status === 404) {
    return new AppError(
      "AI_UNAVAILABLE",
      "The configured assistant model is not available. Check the model name in the environment.",
    );
  }
  if (typeof status === "number" && status >= 500) {
    return new AppError("AI_UNAVAILABLE", "The assistant's provider is unavailable.");
  }
  if (error instanceof Error && /authentication|api[ _-]?key/i.test(error.message)) {
    return new AppError("AI_UNAVAILABLE", "The assistant is not configured in this environment.");
  }
  return new AppError("AI_UNAVAILABLE", "The assistant could not complete this answer.");
}

export interface Citation {
  id: string;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  chunkId: string;
  passage: string;
  sourceType: string;
  sourceStatus: string;
}

export interface AgentClaim {
  id: string;
  text: string;
  kind: "confirmed" | "inferred" | "hypothesis" | "conflicting" | "missing";
  citationIds: string[];
  pathIds: string[];
}

export interface AgentAnswer {
  text: string;
  answerStatus: "answered" | "partial" | "insufficient_evidence";
  claims: AgentClaim[];
  citations: Citation[];
  followUps: string[];
}

interface ComposedAnswer {
  text: string;
  answerStatus: "answered" | "partial" | "insufficient_evidence";
  claims: { text: string; kind: string; citationIds: string[] }[];
  followUps: string[];
}

const COMPOSE_TOOL: LlmTool = {
  name: "compose_answer",
  description:
    "Provide the final answer once you have enough evidence. Every confirmed claim must cite retrieved chunk ids.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["text", "answerStatus", "claims", "followUps"],
    properties: {
      text: { type: "string" },
      answerStatus: { type: "string", enum: ["answered", "partial", "insufficient_evidence"] },
      claims: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "kind", "citationIds"],
          properties: {
            text: { type: "string" },
            kind: {
              type: "string",
              enum: ["confirmed", "inferred", "hypothesis", "conflicting", "missing"],
            },
            citationIds: { type: "array", items: { type: "string" } },
          },
        },
      },
      followUps: { type: "array", items: { type: "string" } },
    },
  },
};

const SYSTEM_PROMPT = `You are the Cerevia assistant. Answer questions about the organization using ONLY the provided tools.

Rules:
- Search documents and the knowledge graph to gather evidence before answering.
- Never present a hypothesis or inference as a confirmed fact. Label every claim with its evidence kind: confirmed (directly supported by a retrieved passage), inferred, or hypothesis.
- A "confirmed" claim MUST include at least one citationId from a retrieved chunk.
- If the evidence is insufficient, set answerStatus to "insufficient_evidence" and say what is missing.
- When you have gathered enough evidence, call compose_answer exactly once.`;

export async function runAgent(ctx: ToolContext, question: string): Promise<AgentAnswer> {
  try {
    return await runAgentLoop(ctx, question);
  } catch (error) {
    throw asAgentError(error);
  }
}

async function runAgentLoop(ctx: ToolContext, question: string): Promise<AgentAnswer> {
  const provider = requireProvider();
  const retrievedCitations = new Map<string, Citation>();
  let composed: ComposedAnswer | undefined;

  const conversation = provider.startConversation({
    system: SYSTEM_PROMPT,
    tools: [...tools.map((t) => t.tool), COMPOSE_TOOL],
    question,
  });

  let pendingResults: LlmToolResult[] | undefined;

  for (let i = 0; i < 8; i++) {
    const turn = await conversation.advance(pendingResults);

    const compose = turn.toolCalls.find((call) => call.name === "compose_answer");
    if (compose) {
      composed = compose.input as unknown as ComposedAnswer;
      break;
    }

    if (turn.toolCalls.length === 0) {
      // The model answered in prose. Ask once more, requiring the structured answer,
      // so claims keep their evidence kinds and citations.
      const forced = await conversation.advance(
        [],
        { forceTool: "compose_answer" },
      ).catch(() => undefined);

      const composeCall = forced?.toolCalls.find((call) => call.name === "compose_answer");
      composed = composeCall
        ? (composeCall.input as unknown as ComposedAnswer)
        : { text: turn.text, answerStatus: "answered", claims: [], followUps: [] };
      break;
    }

    const toolResults: LlmToolResult[] = [];
    for (const call of turn.toolCalls) {
      const def = getToolDef(call.name);
      if (!def) {
        toolResults.push({ id: call.id, name: call.name, output: "Unknown tool", isError: true });
        continue;
      }

      let result: unknown;
      try {
        result = await def.handler(call.input, ctx);
      } catch (error) {
        toolResults.push({
          id: call.id,
          name: call.name,
          output: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
        continue;
      }

      if (call.name === "search_documents") {
        const hits = (result as { hits?: RetrievalHitLike[] }).hits ?? [];
        for (const hit of hits) {
          retrievedCitations.set(hit.chunkId, {
            id: `cit_${hit.chunkId}`,
            documentId: hit.documentId,
            documentTitle: hit.documentTitle,
            documentVersion: "",
            chunkId: hit.chunkId,
            passage: hit.text.slice(0, 600),
            sourceType: "document",
            sourceStatus: "approved",
          });
        }
      }

      toolResults.push({ id: call.id, name: call.name, output: result });
    }

    pendingResults = toolResults;
  }

  if (!composed) {
    composed = { text: "I could not complete the answer.", answerStatus: "insufficient_evidence", claims: [], followUps: [] };
  }

  // Citation guard: drop or downgrade claims whose citations weren't retrieved this turn.
  const valid = retrievedCitations;
  const normalizeCitation = (id: string): string => (id.startsWith("cit_") ? id.slice(4) : id);
  const claims: AgentClaim[] = (composed.claims ?? [])
    .map((c) => {
      const citationIds = (c.citationIds ?? []).filter((id) => valid.has(normalizeCitation(id)));
      const kind = (c.kind === "confirmed" && citationIds.length === 0 ? "inferred" : c.kind) as AgentClaim["kind"];
      return { text: c.text, kind, citationIds };
    })
    .filter((c) => c.text.length > 0)
    // The contract requires id and pathIds; no graph paths are traced yet.
    .map((c, index) => ({ id: `clm_${index + 1}`, ...c, pathIds: [] }));

  const versions = await latestVersions(ctx.orgId, [
    ...new Set([...retrievedCitations.values()].map((c) => c.documentId)),
  ]);

  return {
    text: composed.text,
    answerStatus: composed.answerStatus,
    claims,
    citations: [...retrievedCitations.values()].map((c) => ({
      ...c,
      documentVersion: versions.get(c.documentId) ?? "unknown",
    })),
    followUps: composed.followUps ?? [],
  };
}

interface RetrievalHitLike {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
}

async function latestVersions(orgId: string, documentIds: string[]): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();
  const result = await query<{ document_id: string; version: number }>(
    `SELECT document_id, max(version) AS version FROM document_versions
     WHERE org_id = $1 AND document_id = ANY($2) GROUP BY document_id`,
    [orgId, documentIds],
  );
  return new Map(result.rows.map((row) => [row.document_id, String(row.version)]));
}
