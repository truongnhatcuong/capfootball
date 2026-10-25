import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assert, AppError } from "@/lib/errors";
import { requireAdmin, requireUser } from "@/lib/guards";
import { rateLimit } from "@/lib/ratelimit";
import { publicUserSelect, publicUser } from "@/lib/public-user";
import { pageSchema, pageResult, cursorWhere } from "@/lib/pagination";
import { FORMATS } from "@/constants/skill";
import { requestSchema, requestActionSchema, messageSchema, reportSchema, venueSchema, pushSchema } from "@/schemas";
import { realtime } from "@/lib/realtime";
import { listMatches, matchDetail, createMatch, updateMatch, requestMatch, decideRequest } from "./matches";
import { listConversations, getMessages, sendMessage, conversationAccess } from "./conversations";
import { updateProfile, deleteProfile, profileZaloPhone } from "./profile";
import { rateMatch, disputeRating } from "./ratings";
import { adminRead, adminMutate } from "./admin";
import { tick } from "./cron";
import { listVietQrBanks } from "./banks";
async function writer(key: string, limit: number, window = 60) {
  const user = await requireUser(true); await rateLimit(`${key}:${user.id}`, limit, window); return user;
}
export async function dispatch(request: Request, path: string[], body: unknown) {
  const [resource, id, action] = path, method = request.method;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const key = path.join("/");
  if (key === "health" && method === "GET") {
    try { await prisma.$queryRaw`SELECT 1`; return Response.json({ status: "ok", time: new Date().toISOString() }); }
    catch { return Response.json({ status: "unhealthy" }, { status: 503 }); }
  }
  if (resource === "cron" && ["tick", "expire"].includes(id) && method === "GET") {
    const expected = process.env.CRON_SECRET, actual = request.headers.get("authorization")?.replace(/^Bearer /, "");
    assert(expected && actual && Buffer.byteLength(expected) === Buffer.byteLength(actual) && timingSafeEqual(Buffer.from(expected), Buffer.from(actual)), 401, "UNAUTHORIZED", "Không có quyền chạy cron.");
    return tick();
  }
  if (resource === "admin") {
    const admin = await requireAdmin();
    if (method === "GET") return adminRead(id, query, action);
    await rateLimit(`admin:${admin.id}`, 60);
    return adminMutate(id, action, method, body, admin.id);
  }
  if (key === "provinces" && method === "GET") return { data: await prisma.province.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }) };
  if (key === "donate" && method === "GET") return await prisma.donateConfig.findUnique({ where: { id: 1 } });
  if (key === "banks" && method === "GET") return listVietQrBanks();
  if (resource === "matches") {
    if (!id && method === "GET") return listMatches(query);
    if (!id && method === "POST") return createMatch((await writer("match", 5, 3600)).id, body);
    if (id && !action && method === "GET") {
      const session = process.env.AUTH_SECRET ? await auth() : null;
      const viewer = session?.user?.id ? await prisma.user.findFirst({ where: { id: session.user.id, status: "ACTIVE", deletedAt: null } }) : null;
      return matchDetail(id, viewer);
    }
    if (id && !action && method === "PATCH") return updateMatch(id, (await writer("edit-match", 10)).id, body);
    if (action === "requests" && method === "POST") { const user = await writer("request", 10, 3600); return requestMatch(id, user.id, requestSchema.parse(body).note); }
    if (action === "rating" && method === "POST") return rateMatch(id, (await writer("rating", 10)).id, body);
    if (id && ["rating", "ratings"].includes(action) && method === "GET") {
      const user = await requireUser(); const detail = await matchDetail(id, user);
      assert(detail.ownerId === user.id || detail.requests.some((r) => r.userId === user.id && r.status === "ACCEPTED"), 403, "FORBIDDEN", "Chỉ hai bên được xem đánh giá của trận.");
      return { data: await prisma.rating.findMany({ where: { matchId: id, hidden: false } }) };
    }
  }
  if (resource === "requests" && id && method === "PATCH") { const user = await writer("decision", 20); return decideRequest(id, user.id, requestActionSchema.parse(body).status); }
  if (key === "me") {
    const user = await requireUser();
    if (method === "GET") return user;
    await rateLimit(`profile:${user.id}`, 20);
    if (method === "PATCH") return updateProfile(user.id, body);
    if (method === "DELETE") { await deleteProfile(user.id); return { success: true }; }
  }
  if (key === "me/matches" && method === "GET") {
    const user = await requireUser(); const { limit, cursor } = pageSchema.parse(query);
    return pageResult(await prisma.match.findMany({ where: { AND: [cursorWhere(cursor), { OR: [{ ownerId: user.id }, { requests: { some: { userId: user.id } } }] }] }, include: { owner: { select: publicUserSelect }, province: true, venueRef: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }), limit);
  }
  if (resource === "conversations") {
    const user = await requireUser(method === "POST");
    if (!id && method === "GET") return listConversations(user.id, query);
    if (!id && method === "POST") {
      await rateLimit(`conversation:${user.id}`, 10);
      const data = z.object({ matchId: z.string().min(1), userId: z.string().min(1).optional() }).parse(body);
      const match = await prisma.match.findUnique({ where: { id: data.matchId } });
      assert(match && !match.hidden, 404, "NOT_FOUND", "Không tìm thấy kèo.");
      const requesterId = match.ownerId === user.id ? data.userId : user.id;
      assert(requesterId && requesterId !== match.ownerId, 422, "INVALID_PARTNER", "Vui lòng chọn người nhận kèo.");
      assert(await prisma.matchRequest.findUnique({ where: { matchId_userId: { matchId: match.id, userId: requesterId } } }), 403, "REQUEST_REQUIRED", "Vui lòng gửi yêu cầu nhận kèo trước khi chat.");
      return prisma.conversation.upsert({ where: { matchId_requesterId: { matchId: match.id, requesterId } }, create: { matchId: match.id, requesterId, members: { create: [{ userId: match.ownerId }, { userId: requesterId }] } }, update: {} });
    }
    if (id && action === "messages" && method === "GET") return getMessages(id, user.id, query);
    if (id && action === "messages" && method === "POST") { await rateLimit(`message:${user.id}`, 20); return sendMessage(id, user.id, messageSchema.parse(body).body); }
  }
  if (key === "realtime/auth" && method === "POST") {
    const user = await requireUser(); await rateLimit(`realtime:${user.id}`, 60);
    const data = z.object({ channel_name: z.string().max(200), socket_id: z.string().regex(/^\d+\.\d+$/) }).parse(body);
    if (data.channel_name.startsWith("private-conv-")) await conversationAccess(data.channel_name.slice(13), user.id);
    else assert(data.channel_name === `private-user-${user.id}`, 403, "FORBIDDEN", "Kênh không hợp lệ.");
    return realtime.authorize(data.channel_name, data.socket_id);
  }
  if (resource === "venues" && !id) {
    if (method === "GET") {
      const { limit, cursor } = pageSchema.parse(query);
      const format = query.format ? z.enum(FORMATS).parse(query.format) : undefined;
      return pageResult(await prisma.venue.findMany({ where: { ...cursorWhere(cursor), status: "APPROVED", province: { enabled: true }, ...(query.province ? { provinceCode: query.province } : {}), ...(query.q ? { name: { contains: query.q.slice(0, 100) } } : {}), ...(format ? { formats: { array_contains: format } } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }), limit);
    }
    if (method === "POST") {
      const user = await writer("venue", 5, 3600); const data = venueSchema.parse(body);
      assert(await prisma.province.findFirst({ where: { code: data.provinceCode, enabled: true } }), 422, "INVALID_PROVINCE", "Tỉnh/thành chưa được hỗ trợ.");
      return prisma.venue.create({ data: { ...data, normalizedName: data.name.toLocaleLowerCase("vi"), status: "PENDING", createdById: user.id } });
    }
  }
  if (resource === "notifications") {
    const user = await requireUser();
    if (!id && method === "GET") { const { cursor, limit } = pageSchema.parse(query); return pageResult(await prisma.notification.findMany({ where: { userId: user.id, ...cursorWhere(cursor) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }), limit); }
    if (id === "unread-count" && method === "GET") return { count: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
    if (id === "read" && method === "POST") { const { ids } = z.object({ ids: z.array(z.string().max(100)).max(100).optional() }).parse(body); return prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } }); }
  }
  if (key === "ratings/pending" && method === "GET") {
    const user = await requireUser();
    return { data: await prisma.match.findMany({ where: { status: "MATCHED", hidden: false, kickoffAt: { lte: new Date(Date.now() - 3 * 3600000) }, ratings: { none: { raterId: user.id } }, OR: [{ ownerId: user.id }, { requests: { some: { userId: user.id, status: "ACCEPTED" } } }] }, take: 50, orderBy: { kickoffAt: "desc" } }) };
  }
  if (resource === "ratings" && id && action === "dispute" && method === "POST") return disputeRating(id, (await writer("dispute", 10)).id);
  if (resource === "users" && id && method === "GET") {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null, status: "ACTIVE" }, select: { ...publicUserSelect, province: { select: { name: true } } } });
    assert(user, 404, "NOT_FOUND", "Không tìm thấy người dùng.");
    const { cursor, limit } = pageSchema.parse(query);
    const session = process.env.AUTH_SECRET ? await auth() : null;
    const zaloPhone = await profileZaloPhone(id, session?.user?.id);
    return { ...publicUser(user), zaloPhone, ratings: pageResult(await prisma.rating.findMany({ where: { ratedUserId: id, hidden: false, happened: true, ...cursorWhere(cursor) }, select: { id: true, stars: true, comment: true, createdAt: true, rater: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 }), limit) };
  }
  if (key === "reports" && method === "POST") {
    const user = await writer("report", 5, 3600); const data = reportSchema.parse(body);
    let exists: unknown;
    if (data.targetType === "MATCH") exists = await prisma.match.findUnique({ where: { id: data.targetId } });
    else if (data.targetType === "USER") exists = await prisma.user.findUnique({ where: { id: data.targetId } });
    else if (data.targetType === "RATING") exists = await prisma.rating.findUnique({ where: { id: data.targetId } });
    else exists = await prisma.message.findFirst({ where: { id: data.targetId, conversation: { members: { some: { userId: user.id } } } } });
    assert(exists, 404, "NOT_FOUND", "Không tìm thấy nội dung báo cáo.");
    return prisma.report.create({ data: { ...data, reporterId: user.id } });
  }
  if (resource === "blocks") {
    const user = await requireUser(true);
    if (method === "GET") return { data: await prisma.userBlock.findMany({ where: { blockerId: user.id }, include: { blocked: { select: publicUserSelect } }, take: 100 }) };
    if (method === "POST") { await rateLimit(`block:${user.id}`, 10); const data = z.object({ userId: z.string().min(1).max(100) }).parse(body); assert(data.userId !== user.id, 422, "SELF_BLOCK", "Không thể tự chặn."); return prisma.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: data.userId } }, create: { blockerId: user.id, blockedId: data.userId }, update: {} }); }
    if (method === "DELETE" && id) return prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: id } });
  }
  if (key === "push/subscribe") {
    const user = await writer("push", 10);
    if (method === "POST") {
      const data = pushSchema.parse(body), host = new URL(data.endpoint).hostname;
      assert(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(host) || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"), 422, "INVALID_PUSH_ENDPOINT", "Nhà cung cấp push không được hỗ trợ.");
      const old = await prisma.pushSubscription.findUnique({ where: { endpoint: data.endpoint } });
      assert(!old || old.userId === user.id, 409, "ENDPOINT_IN_USE", "Hãy hủy đăng ký push của tài khoản cũ trước.");
      return prisma.pushSubscription.upsert({ where: { endpoint: data.endpoint }, create: { endpoint: data.endpoint, ...data.keys, userId: user.id }, update: data.keys });
    }
    if (method === "DELETE") { const { endpoint } = z.object({ endpoint: z.url() }).parse(body); return prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } }); }
  }
  throw new AppError(404, "NOT_FOUND", "Không tìm thấy API.");
}
