/** Provider-neutral tool calling, used by the agent loop and entity extraction. */

export type JsonSchema = Record<string, unknown>;

export interface LlmTool {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmToolResult {
  id: string;
  name: string;
  /** Raw tool output; each provider serializes it its own way. */
  output: unknown;
  isError?: boolean;
}

export interface LlmTurn {
  text: string;
  toolCalls: LlmToolCall[];
}

export interface AdvanceOptions {
  /** Require this tool on the turn, e.g. a structured answer after the model drifted into prose. */
  forceTool?: string;
}

export interface LlmConversation {
  advance(results?: LlmToolResult[], options?: AdvanceOptions): Promise<LlmTurn>;
}

export interface StartConversationOptions {
  system: string;
  tools: LlmTool[];
  question: string;
  maxOutputTokens?: number;
}

export interface SingleToolCallOptions<T> {
  system: string;
  prompt: string;
  tool: LlmTool;
  maxOutputTokens?: number;
  parse: (input: Record<string, unknown>) => T | undefined;
}

export interface LlmProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  readonly model: string;

  startConversation(options: StartConversationOptions): LlmConversation;

  callTool<T>(options: SingleToolCallOptions<T>): Promise<T | undefined>;
}
