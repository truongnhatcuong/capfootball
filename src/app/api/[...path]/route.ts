import { randomUUID } from "node:crypto";
import { dispatch } from "@/services/api";
import { AppError, assert, errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const requestId = randomUUID();
  try {
    const { path } = await context.params;
    assert(path.length <= 3, 404, "NOT_FOUND", "Không tìm thấy API.");
    let body: unknown = {};
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const allowed = new Set([new URL(request.url).origin, process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : ""]);
      assert(!origin || allowed.has(origin), 403, "INVALID_ORIGIN", "Nguồn yêu cầu không hợp lệ.");
      const length = Number(request.headers.get("content-length") ?? 0);
      assert(length <= 600000, 413, "PAYLOAD_TOO_LARGE", "Dữ liệu quá lớn.");
      // Bound streamed bodies too, rather than trusting Content-Length.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 600000) { await reader.cancel(); throw new AppError(413, "PAYLOAD_TOO_LARGE", "Dữ liệu quá lớn."); } chunks.push(value); }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        if (path.join("/") === "realtime/auth" && request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw));
        else { assert(request.headers.get("content-type")?.includes("application/json"), 415, "JSON_REQUIRED", "Yêu cầu phải dùng JSON."); try { body = JSON.parse(raw); } catch { throw new AppError(400, "INVALID_JSON", "JSON không hợp lệ."); } }
      }
    }
    const result = await dispatch(request, path, body);
    if (result instanceof Response) { result.headers.set("Cache-Control", "no-store"); result.headers.set("X-Request-Id", requestId); return result; }
    return Response.json(result, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch (error) { return errorResponse(error, requestId); }
}
export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
