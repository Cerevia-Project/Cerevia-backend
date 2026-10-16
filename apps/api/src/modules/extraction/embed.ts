import { VoyageAIClient } from "voyageai";
import { env } from "../../config/env.js";

let client: VoyageAIClient | undefined;

function getClient(): VoyageAIClient {
  if (!client) {
    client = new VoyageAIClient({ apiKey: env.voyage.apiKey });
  }
  return client;
}

/**
 * Embed a list of texts. Returns parallel empty arrays when no key is configured.
 * `client.embed()` resolves directly to `{ object, data: [{ embedding }], model, usage }`.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!env.voyage.apiKey || texts.length === 0) {
    return [];
  }

  const response = await getClient().embed({ model: env.voyage.model, input: texts });
  return (response.data ?? [])
    .map((item) => item.embedding)
    .filter((embedding): embedding is number[] => Array.isArray(embedding));
}
