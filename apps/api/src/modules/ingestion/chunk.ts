import { newId } from "../../lib/ids.js";

export interface TextChunk {
  id: string;
  index: number;
  text: string;
  section: string | null;
}

/**
 * Simple section-aware chunker: split into paragraphs, then greedily pack into
 * chunks up to `maxChars`. Section detection from markdown headings is
 * best-effort (refined alongside embedding in B2).
 */
export function chunkText(text: string, maxChars = 1500): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let current = "";
  let section: string | null = null;
  let index = 0;

  const flush = () => {
    if (current) {
      chunks.push({ id: newId("chk"), index: index++, text: current, section });
      current = "";
    }
  };

  for (const para of paragraphs) {
    const heading = /^#{1,6}\s+(.+)$/.exec(para);
    if (heading) {
      section = heading[1] ?? null;
      flush();
      current = para;
      continue;
    }

    if ((current + "\n\n" + para).length <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
    } else {
      flush();
      current = para;
    }
  }
  flush();

  return chunks;
}
