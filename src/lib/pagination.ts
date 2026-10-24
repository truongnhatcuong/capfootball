import { z } from "zod";
export const pageSchema = z.object({ cursor: z.string().max(600).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const cursorSchema = z.object({ id: z.string().min(1).max(100), createdAt: z.iso.datetime() });
export function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  let value: unknown;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { value = null; }
  const parsed = cursorSchema.parse(value);
  return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
}
export function cursorWhere(cursor?: string) {
  const value = decodeCursor(cursor);
  return value ? { OR: [{ createdAt: { lt: value.createdAt } }, { createdAt: value.createdAt, id: { lt: value.id } }] } : {};
}
export function pageResult<T extends { id: string; createdAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit, data = rows.slice(0, limit), last = data.at(-1);
  return { data, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString("base64url") : null };
}
