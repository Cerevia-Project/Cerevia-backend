import Anthropic from "@anthropic-ai/sdk";
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

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropic.apiKey });
  }
  return client;
}

function toTools(tools: StartConversationOptions["tools"]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

class AnthropicConversation implements LlmConversation {
  private readonly messages: Anthropic.MessageParam[];
  private lastContent: Anthropic.ContentBlock[] = [];

  constructor(private readonly options: StartConversationOptions) {
    this.messages = [{ role: "user", content: options.question }];
  }

  async advance(results?: LlmToolResult[], options?: AdvanceOptions): Promise<LlmTurn> {
    if (results && results.length > 0) {
      this.messages.push({
        role: "assistant",
        content: this.lastContent.filter(
          (block) => block.type === "text" || block.type === "tool_use",
        ) as Anthropic.ContentBlockParam[],
      });
      this.messages.push({
        role: "user",
        content: results.map<Anthropic.ToolResultBlockParam>((result) => ({
          type: "tool_result",
          tool_use_id: result.id,
          content:
            typeof result.output === "string" ? result.output : JSON.stringify(result.output),
          ...(result.isError ? { is_error: true } : {}),
        })),
      });
    }

    const response = await getClient().messages.create({
      model: env.anthropic.model,
      max_tokens: this.options.maxOutputTokens ?? 16000,
      system: this.options.system,
      tools: toTools(this.options.tools),
      tool_choice: options?.forceTool
        ? { type: "tool", name: options.forceTool }
        : { type: "auto" },
      messages: this.messages,
    });

    this.lastContent = response.content;

    const toolCalls: LlmToolCall[] = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }));

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return { text, toolCalls };
  }
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  get isConfigured() {
    return Boolean(env.anthropic.apiKey);
  },
  get model() {
    return env.anthropic.model;
  },

  startConversation(options: StartConversationOptions): LlmConversation {
    return new AnthropicConversation(options);
  },

  async callTool<T>(options: SingleToolCallOptions<T>): Promise<T | undefined> {
    const response = await getClient().messages.create({
      model: env.anthropic.model,
      max_tokens: options.maxOutputTokens ?? 16000,
      system: options.system,
      tools: toTools([options.tool]),
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: options.prompt }],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === options.tool.name) {
        return options.parse(block.input as Record<string, unknown>);
      }
    }
    return undefined;
  },
};
