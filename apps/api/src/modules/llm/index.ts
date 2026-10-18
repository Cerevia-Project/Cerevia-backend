import { env } from "../../config/env.js";
import { anthropicProvider } from "./anthropic.js";
import { geminiProvider } from "./gemini.js";
import type { LlmProvider } from "./types.js";

export * from "./types.js";

const PROVIDERS: Record<string, LlmProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/** The provider selected by LLM_PROVIDER. */
export function getLlmProvider(): LlmProvider {
  const provider = PROVIDERS[env.llmProvider];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${env.llmProvider}". Expected one of: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return provider;
}
