import { parse } from "csv-parse/sync";
import mammoth from "mammoth";
import { extractText } from "unpdf";

/**
 * Extract plain text from a raw file buffer. Text is untrusted data — callers
 * must treat it as such (delimiting before any LLM use).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  extension: string,
  mimeType: string,
): Promise<string> {
  switch (extension.toLowerCase()) {
    case "pdf": {
      const result = await extractText(buffer, { mergePages: true });
      return result.text;
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt":
    case "md":
      return buffer.toString("utf8");
    case "csv": {
      const records = parse(buffer.toString("utf8"), { columns: true, bom: true });
      return JSON.stringify(records, null, 2);
    }
    case "json":
      return buffer.toString("utf8");
    default:
      // Fall back to a naive decode for anything else we allowed through.
      if (mimeType.startsWith("text/") || mimeType === "application/json") {
        return buffer.toString("utf8");
      }
      throw new Error(`No extractor for extension ".${extension}"`);
  }
}
