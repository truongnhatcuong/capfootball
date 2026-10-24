import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assert } from "@/lib/errors";
import { publicUser, publicUserSelect } from "@/lib/public-user";
import { cursorWhere, pageResult, pageSchema } from "@/lib/pagination";
import { matchSchema, matchPatchSchema, skillSchema, provinceCode } from "@/schemas";
import { FORMATS, SKILLS, skillRange } from "@/constants/skill";
import { assertNotBlocked } from "@/lib/blocks";
import { notify } from "./notify";
const include = { owner: { select: publicUserSelect }, province: true, venueRef: true } satisfies Prisma.MatchInclude;
const listSchema = pageSchema.extend({ province: provinceCode.optional(), skillMin: skillSchema.optional(), skillMax: skillSchema.optional(), format: z.enum(FORMATS).optional(), date: z.iso.date().optional(), q: z.string().trim().max(100).optional() }).refine((v) => !v.skillMin || !v.skillMax || SKILLS.indexOf(v.skillMin) <= SKILLS.indexOf(v.skillMax), { message: "Khoảng trình độ không hợp lệ" });
export async function listMatches(query: Record<string, string>) {
  const filters = listSchema.parse(query);
  const date = filters.date ? new Date(`${filters.date}T00:00:00+07:00`) : undefined;
  const where: Prisma.MatchWhereInput = {
    hidden: false, status: "OPEN", owner: { status: "ACTIVE", deletedAt: null }, province: { enabled: true },
    provinceCode: filters.province, format: filters.format,
    kickoffAt: { gt: new Date(), ...(date ? { gte: date, lt: new Date(date.getTime() + 86400000) } : {}) },
    ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { teamName: { contains: filters.q } }, { venue: { contains: filters.q } }] } : {}),
    AND: [cursorWhere(filters.cursor), { skill: { in: [...skillRange(filters.skillMin, filters.skillMax)] } }],
  };
  const rows = await prisma.match.findMany({ where, include, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: filters.limit + 1 });
  return pageResult(rows.map((m) => ({ ...m, owner: publicUser(m.owner) })), filters.limit);
}
export async function matchDetail(id: string, viewer?: User | null) {
  const match = await prisma.match.findUnique({ where: { id }, include });
  assert(match && (!match.hidden || viewer?.id === match.ownerId || viewer?.role === "ADMIN"), 404, "NOT_FOUND", "Không tìm thấy kèo.");
  const isOwner = viewer?.id === match.ownerId;
  const requests = viewer ? await prisma.matchRequest.findMany({ where: { matchId: id, ...(isOwner ? {} : { userId: viewer.id }) }, include: { user: { select: publicUserSelect } }, orderBy: { createdAt: "asc" } }) : [];
  let zaloPhone: string | null = null;
  if (viewer && match.status === "MATCHED") {
    const accepted = await prisma.matchRequest.findFirst({ where: { matchId: id, status: "ACCEPTED" } });
    if (accepted && (isOwner || accepted.userId === viewer.id)) {
      const partner = await prisma.user.findUnique({ where: { id: isOwner ? accepted.userId : match.ownerId }, select: { zaloPhone: true, zaloConsentAt: true, deletedAt: true, status: true } });
      if (partner?.zaloConsentAt && !partner.deletedAt && partner.status === "ACTIVE") zaloPhone = partner.zaloPhone;
    }
  }
  return { ...match, owner: publicUser(match.owner), requests: requests.map((r) => ({ ...r, user: publicUser(r.user) })), zaloPhone };
}
async function validateLocation(data: { provinceCode: string; venueId?: string | null; format: string }) {
  const province = await prisma.province.findFirst({ where: { code: data.provinceCode, enabled: true } });
  assert(province, 422, "INVALID_PROVINCE", "Tỉnh/thành chưa được hỗ trợ.");
  if (data.venueId) {
    const venue = await prisma.venue.findFirst({ where: { id: data.venueId, provinceCode: data.provinceCode, status: "APPROVED" } });
    assert(venue && Array.isArray(venue.formats) && venue.formats.includes(data.format), 422, "INVALID_VENUE", "Sân không thuộc tỉnh hoặc không hỗ trợ loại sân đã chọn.");
  }
}
export async function createMatch(ownerId: string, input: unknown) {
  const { suggestVenue, ...data } = matchSchema.parse(input);
  await validateLocation(data);
  return prisma.$transaction(async (tx) => {
    if (suggestVenue && !data.venueId && data.venue && data.address) {
      await tx.venue.upsert({ where: { provinceCode_normalizedName: { provinceCode: data.provinceCode, normalizedName: data.venue.trim().toLocaleLowerCase("vi") } }, create: { name: data.venue, normalizedName: data.venue.trim().toLocaleLowerCase("vi"), address: data.address, provinceCode: data.provinceCode, formats: [data.format], createdById: ownerId, status: "PENDING" }, update: {} });
    }
    return tx.match.create({ data: { ...data, ownerId }, include });
  });
}
export async function updateMatch(id: string, ownerId: string, input: unknown) {
  const patch = matchPatchSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Match\` WHERE id = ${id} FOR UPDATE`;
    const old = await tx.match.findUnique({ where: { id } });
    assert(old, 404, "NOT_FOUND", "Không tìm thấy kèo.");
    assert(old.ownerId === ownerId, 403, "FORBIDDEN", "Chỉ chủ kèo được sửa.");
    assert(!old.hidden && old.kickoffAt > new Date() && (old.status === "OPEN" || (old.status === "MATCHED" && patch.status === "CANCELLED")), 409, "INVALID_STATE", "Kèo không còn có thể chỉnh sửa.");
    if (patch.status === "CANCELLED") {
      assert(Object.keys(patch).length === 1, 422, "INVALID_INPUT", "Hủy kèo không kèm sửa thông tin.");
      const participants = await tx.matchRequest.findMany({ where: { matchId: id, status: { in: ["PENDING", "ACCEPTED"] } } });
      await tx.matchRequest.updateMany({ where: { matchId: id, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
      for (const r of participants) await tx.notification.create({ data: { userId: r.userId, type: "SYSTEM", title: "Chủ kèo đã hủy trận", url: `/matches/${id}`, dedupeKey: `cancel:${id}:${r.userId}` } });
    } else {
      const merged = matchSchema.parse({ ...old, ...patch, kickoffAt: (patch.kickoffAt ?? old.kickoffAt).toISOString() });
      await validateLocation(merged);
      const pending = await tx.matchRequest.count({ where: { matchId: id, status: "PENDING" } });
      assert(pending === 0, 409, "HAS_REQUESTS", "Kèo đã có yêu cầu nhận. Hãy hủy và đăng lại để thay đổi thông tin.");
    }
    return tx.match.update({ where: { id }, data: patch, include });
  });
}
export async function requestMatch(matchId: string, userId: string, note?: string) {
  const initial = await prisma.match.findUnique({ where: { id: matchId } });
  assert(initial, 404, "NOT_FOUND", "Không tìm thấy kèo.");
  await assertNotBlocked(initial.ownerId, userId);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Match\` WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { owner: true } });
    assert(match && !match.hidden && match.status === "OPEN" && match.kickoffAt > new Date() && match.owner.status === "ACTIVE" && !match.owner.deletedAt, 409, "MATCH_UNAVAILABLE", "Kèo không còn nhận đối thủ.");
    assert(match.ownerId !== userId, 422, "OWN_MATCH", "Bạn không thể nhận kèo của mình.");
    const request = await tx.matchRequest.create({ data: { matchId, userId, note } });
    const conversation = await tx.conversation.upsert({ where: { matchId_requesterId: { matchId, requesterId: userId } }, create: { matchId, requesterId: userId, members: { create: [{ userId }, { userId: match.ownerId }] } }, update: {} });
    return { request, conversationId: conversation.id, ownerId: match.ownerId };
  });
  await notify(result.ownerId, "REQUEST_RECEIVED", { title: "Có đối thủ muốn nhận kèo của bạn", url: `/matches/${matchId}`, key: `request:${result.request.id}` });
  return { request: result.request, conversationId: result.conversationId };
}
export async function decideRequest(id: string, actorId: string, status: "ACCEPTED" | "REJECTED" | "CANCELLED") {
  const initial = await prisma.matchRequest.findUnique({ where: { id } });
  assert(initial, 404, "NOT_FOUND", "Không tìm thấy yêu cầu.");
  const result = await prisma.$transaction(async (tx) => {
    // Lock the shared match before reading the request: only one concurrent acceptance can win.
    await tx.$queryRaw`SELECT id FROM \`Match\` WHERE id = ${initial.matchId} FOR UPDATE`;
    const request = await tx.matchRequest.findUnique({ where: { id }, include: { match: true, user: true } });
    assert(request, 404, "NOT_FOUND", "Không tìm thấy yêu cầu.");
    assert(status === "CANCELLED" ? request.userId === actorId : request.match.ownerId === actorId, 403, "FORBIDDEN", "Bạn không có quyền xử lý yêu cầu.");
    assert(request.status === "PENDING" && request.match.status === "OPEN" && !request.match.hidden && request.match.kickoffAt > new Date(), 409, "INVALID_STATE", "Yêu cầu không còn chờ xử lý.");
    const rejected: string[] = [];
    if (status === "ACCEPTED") {
      assert(request.user.status === "ACTIVE" && !request.user.deletedAt, 409, "ACCOUNT_DISABLED", "Người nhận kèo không còn hoạt động.");
      await assertNotBlocked(actorId, request.userId);
      await tx.match.update({ where: { id: request.matchId }, data: { status: "MATCHED" } });
      const others = await tx.matchRequest.findMany({ where: { matchId: request.matchId, id: { not: id }, status: "PENDING" } });
      rejected.push(...others.map((r) => r.userId));
      await tx.matchRequest.updateMany({ where: { matchId: request.matchId, id: { not: id }, status: "PENDING" }, data: { status: "REJECTED" } });
    }
    const updated = await tx.matchRequest.update({ where: { id }, data: { status } });
    return { updated, rejected };
  });
  if (status !== "CANCELLED") await notify(result.updated.userId, status === "ACCEPTED" ? "REQUEST_ACCEPTED" : "REQUEST_REJECTED", { title: status === "ACCEPTED" ? "Kèo đã chốt! Hẹn gặp trên sân." : "Yêu cầu nhận kèo chưa được chấp nhận", url: `/matches/${result.updated.matchId}`, key: `decision:${id}` });
  for (const userId of result.rejected) await notify(userId, "REQUEST_REJECTED", { title: "Kèo đã chốt với đối thủ khác", url: `/matches/${result.updated.matchId}`, key: `reject:${result.updated.matchId}:${userId}` });
  return result.updated;
}
