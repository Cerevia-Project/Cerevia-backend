import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";
import { getToolDef, tools, type ToolContext } from "./tools.js";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropic.apiKey });
  }
  return client;
}

export interface Citation {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  passage: string;
  sourceType: string;
  sourceStatus: string;
}

export interface AgentClaim {
  text: string;
  kind: "confirmed" | "inferred" | "hypothesis" | "conflicting" | "missing";
  citationIds: string[];
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

const COMPOSE_TOOL: Anthropic.Tool = {
  name: "compose_answer",
  description:
    "Provide the final answer once you have enough evidence. Every confirmed claim must cite retrieved chunk ids.",
  input_schema: {
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
  strict: true,
};

const SYSTEM_PROMPT = `You are the Cerevia assistant. Answer questions about the organization using ONLY the provided tools.

Rules:
- Search documents and the knowledge graph to gather evidence before answering.
- Never present a hypothesis or inference as a confirmed fact. Label every claim with its evidence kind: confirmed (directly supported by a retrieved passage), inferred, or hypothesis.
- A "confirmed" claim MUST include at least one citationId from a retrieved chunk.
- If the evidence is insufficient, set answerStatus to "insufficient_evidence" and say what is missing.
- When you have gathered enough evidence, call compose_answer exactly once.`;

export async function runAgent(ctx: ToolContext, question: string): Promise<AgentAnswer> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const retrievedCitations = new Map<string, Citation>();
  let composed: ComposedAnswer | undefined;

  const toolSchemas: Anthropic.Tool[] = [...tools.map((t) => t.tool), COMPOSE_TOOL];

  for (let i = 0; i < 8; i++) {
    const response = await getClient().messages.create({
      model: env.anthropic.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: toolSchemas,
      tool_choice: { type: "auto" },
      messages,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const compose = toolUses.find((b) => b.name === "compose_answer");
    if (compose) {
      composed = compose.input as unknown as ComposedAnswer;
      break;
    }

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      composed = { text, answerStatus: "answered", claims: [], followUps: [] };
      break;
    }

    messages.push({
      role: "assistant",
      content: response.content.filter(
        (b) => b.type === "text" || b.type === "tool_use",
      ) as Anthropic.ContentBlockParam[],
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const def = getToolDef(toolUse.name);
      if (!def) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Unknown tool",
          is_error: true,
        });
        continue;
      }

      let result: unknown;
      try {
        result = await def.handler(toolUse.input as Record<string, unknown>, ctx);
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
          is_error: true,
        });
        continue;
      }

      if (toolUse.name === "search_documents") {
        const hits = (result as { hits?: RetrievalHitLike[] }).hits ?? [];
        for (const hit of hits) {
          retrievedCitations.set(hit.chunkId, {
            id: `cit_${hit.chunkId}`,
            documentId: hit.documentId,
            documentTitle: hit.documentTitle,
            chunkId: hit.chunkId,
            passage: hit.text.slice(0, 600),
            sourceType: "document",
            sourceStatus: "approved",
          });
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
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
    .filter((c) => c.text.length > 0);

  return {
    text: composed.text,
    answerStatus: composed.answerStatus,
    claims,
    citations: [...retrievedCitations.values()],
    followUps: composed.followUps ?? [],
  };
}

interface RetrievalHitLike {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
}
