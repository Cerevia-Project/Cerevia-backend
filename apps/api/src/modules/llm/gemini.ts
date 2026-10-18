import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type Part,
  type ToolConfig,
} from "@google/genai";
import { env } from "../../config/env.js";
import type {
  AdvanceOptions,
  LlmConversation,
  LlmProvider,
  LlmToolCall,
  LlmToolResult,
  LlmTurn,
  SingleToolCallOptions,
  StartConversationOptions,
} from "./types.js";

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }
  return client;
}

function toFunctionDeclarations(
  tools: StartConversationOptions["tools"],
): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }));
}

// Gemini only sets call ids for parallel calls, so the tool name stands in.
function toToolCalls(calls: { id?: string; name?: string; args?: Record<string, unknown> }[]): LlmToolCall[] {
  return calls
    .filter((call) => Boolean(call.name))
    .map((call) => ({
      id: call.id ?? (call.name as string),
      name: call.name as string,
      input: call.args ?? {},
    }));
}

function forceToolConfig(name: string): ToolConfig {
  return {
    functionCallingConfig: {
      mode: FunctionCallingConfigMode.ANY,
      allowedFunctionNames: [name],
    },
  };
}

function toFunctionResponse(result: LlmToolResult): Record<string, unknown> {
  if (result.isError) {
    return { error: String(result.output) };
  }
  const output = result.output;
  return output !== null && typeof output === "object" && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : { result: output };
}

class GeminiConversation implements LlmConversation {
  private readonly contents: Content[];
  private lastModelContent: Content | undefined;

  constructor(private readonly options: StartConversationOptions) {
    this.contents = [{ role: "user", parts: [{ text: options.question }] }];
  }

  async advance(results?: LlmToolResult[], options?: AdvanceOptions): Promise<LlmTurn> {
    if (results && results.length > 0) {
      // Replay the model turn verbatim: Gemini rejects function calls that lose their thought_signature.
      if (this.lastModelContent) {
        this.contents.push(this.lastModelContent);
      }
      this.contents.push({
        role: "user",
        parts: results.map<Part>((result) => ({
          functionResponse: {
            id: result.id,
            name: result.name,
            response: toFunctionResponse(result),
          },
        })),
      });
    }

    const response = await getClient().models.generateContent({
      model: env.gemini.model,
      contents: this.contents,
      config: {
        systemInstruction: this.options.system,
        tools: [{ functionDeclarations: toFunctionDeclarations(this.options.tools) }],
        maxOutputTokens: this.options.maxOutputTokens ?? 16000,
        ...(options?.forceTool ? { toolConfig: forceToolConfig(options.forceTool) } : {}),
      },
    });

    this.lastModelContent = response.candidates?.[0]?.content;

    return {
      text: response.text ?? "",
      toolCalls: toToolCalls(response.functionCalls ?? []),
    };
  }
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  get isConfigured() {
    return Boolean(env.gemini.apiKey);
  },
  get model() {
    return env.gemini.model;
  },

  startConversation(options: StartConversationOptions): LlmConversation {
    return new GeminiConversation(options);
  },

  async callTool<T>(options: SingleToolCallOptions<T>): Promise<T | undefined> {
    const response = await getClient().models.generateContent({
      model: env.gemini.model,
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      config: {
        systemInstruction: options.system,
        tools: [{ functionDeclarations: toFunctionDeclarations([options.tool]) }],
        maxOutputTokens: options.maxOutputTokens ?? 16000,
      },
    });

    const call = (response.functionCalls ?? []).find((c) => c.name === options.tool.name);
    return call ? options.parse(call.args ?? {}) : undefined;
  },
};
