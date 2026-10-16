export interface Cursor {
  /** Sort key of the last row returned (ISO timestamp), e.g. created_at. */
  sortKey: string;
  /** Tie-breaker id of the last row. */
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
  if (typeof parsed.sortKey !== "string" || typeof parsed.id !== "string") {
    throw new Error("Invalid cursor");
  }
  return parsed;
}

/** Build the `{ items, nextCursor }` envelope for a paginated list. */
export function page<T>(items: T[], nextCursor: Cursor | null) {
  return { items, nextCursor: nextCursor ? encodeCursor(nextCursor) : null };
}
