import { lockAdminChanges } from "@/lib/db-lock";
import { z } from "zod";
import Papa from "papaparse";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assert, AppError } from "@/lib/errors";
import { pageSchema, cursorWhere, pageResult } from "@/lib/pagination";
import { venueSchema, donateSchema } from "@/schemas";
import { recalculateReputation } from "./ratings";
import { cancelUserMatches } from "./profile";
const idSchema = z.string().min(1).max(100);
async function audit(tx: Prisma.TransactionClient, adminId: string, action: string, targetId: string, meta: unknown) {
  await tx.auditLog.create({ data: { adminId, action, targetId, meta: JSON.parse(JSON.stringify(meta)) as Prisma.InputJsonValue } });
}
export async function adminRead(resource: string, query: Record<string, string>, targetId?: string) {
  if (resource === "reports" && targetId) {
    const report = await prisma.report.findUniqueOrThrow({ where: { id: targetId } });
    const target = report.targetType === "MATCH" ? await prisma.match.findUnique({ where: { id: report.targetId } })
      : report.targetType === "USER" ? await prisma.user.findUnique({ where: { id: report.targetId }, select: { id: true, name: true, email: true, status: true } })
      : report.targetType === "MESSAGE" ? await prisma.message.findUnique({ where: { id: report.targetId }, include: { sender: { select: { id: true, name: true } }, conversation: { select: { matchId: true } } } })
      : await prisma.rating.findUnique({ where: { id: report.targetId } });
    return { report, target };
  }
  const { cursor, limit } = pageSchema.parse(query);
  const where = cursorWhere(cursor), orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  if (resource === "stats") {
    const [users, openMatches, matchedMatches, openReports, provinces] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }), prisma.match.count({ where: { status: "OPEN", hidden: false, kickoffAt: { gt: new Date() } } }), prisma.match.count({ where: { status: "MATCHED" } }), prisma.report.count({ where: { status: "OPEN" } }), prisma.match.groupBy({ by: ["provinceCode"], _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    ]);
    return { users, openMatches, matchedMatches, openReports, provinces };
  }
  if (resource === "users") return pageResult(await prisma.user.findMany({ where: { ...where, ...(query.q ? { OR: [{ name: { contains: query.q.slice(0, 100) } }, { email: { contains: query.q.slice(0, 100) } }] } : {}) }, select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true, createdAt: true }, orderBy, take: limit + 1 }), limit);
  if (resource === "matches") return pageResult(await prisma.match.findMany({ where: { ...where, ...(query.status ? { status: z.enum(["OPEN", "PENDING", "MATCHED", "CANCELLED", "EXPIRED"]).parse(query.status) } : {}), ...(query.province ? { provinceCode: query.province } : {}) }, include: { province: true }, orderBy, take: limit + 1 }), limit);
  if (resource === "reports") return pageResult(await prisma.report.findMany({ where, orderBy, take: limit + 1 }), limit);
  if (resource === "venues") return pageResult(await prisma.venue.findMany({ where: { ...where, ...(query.province ? { provinceCode: query.province } : {}) }, include: { province: true }, orderBy, take: limit + 1 }), limit);
  if (resource === "ratings") return pageResult(await prisma.rating.findMany({ where, orderBy, take: limit + 1 }), limit);
  if (resource === "audit-logs") return pageResult(await prisma.auditLog.findMany({ where, orderBy, take: limit + 1 }), limit);
  if (resource === "provinces") return { data: await prisma.province.findMany({ orderBy: { name: "asc" } }), nextCursor: null };
  if (resource === "donate") return await prisma.donateConfig.findUnique({ where: { id: 1 } });
  throw new AppError(404, "NOT_FOUND", "Không tìm thấy chức năng quản trị.");
}
export async function adminMutate(resource: string, id: string | undefined, method: string, input: unknown, adminId: string) {
  if (id) idSchema.parse(id);
  if (resource === "users" && id && method === "PATCH") {
    const patch = z.object({ role: z.enum(["USER", "ADMIN"]).optional(), status: z.enum(["ACTIVE", "BANNED"]).optional() }).parse(input);
    return prisma.$transaction(async (tx) => {
      await lockAdminChanges(tx);
      const old = await tx.user.findUniqueOrThrow({ where: { id } });
      assert(!old.deletedAt, 409, "DELETED_USER", "Tài khoản đã xóa không thể khôi phục.");
      if (old.role === "ADMIN" && (patch.role === "USER" || patch.status === "BANNED")) assert(await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE", deletedAt: null } }) > 1, 409, "LAST_ADMIN", "Phải giữ ít nhất một quản trị viên hoạt động.");
      if (patch.status === "BANNED") { await tx.session.deleteMany({ where: { userId: id } }); await cancelUserMatches(tx, id); }
      const result = await tx.user.update({ where: { id }, data: patch, select: { id: true, name: true, role: true, status: true } });
      await audit(tx, adminId, "UPDATE_USER", id, patch);
      return result;
    }, { isolationLevel: "Serializable", timeout: 15000 });
  }
  if (resource === "matches" && id && method === "PATCH") {
    const patch = z.object({ hidden: z.boolean().optional(), status: z.literal("CANCELLED").optional() }).parse(input);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`Match\` WHERE id = ${id} FOR UPDATE`;
      const result = await tx.match.update({ where: { id }, data: patch });
      if (patch.status === "CANCELLED") await tx.matchRequest.updateMany({ where: { matchId: id, status: { in: ["ACCEPTED", "PENDING"] } }, data: { status: "CANCELLED" } });
      await audit(tx, adminId, "MODERATE_MATCH", id, patch);
      return result;
    });
  }
  if (resource === "reports" && id && method === "PATCH") {
    const data = z.object({ status: z.enum(["RESOLVED", "DISMISSED"]) }).parse(input);
    return prisma.$transaction(async (tx) => {
      const result = await tx.report.update({ where: { id }, data: { ...data, handledBy: adminId } });
      await audit(tx, adminId, "HANDLE_REPORT", id, data);
      return result;
    });
  }
  if (resource === "provinces" && method === "PATCH") {
    const data = z.object({ code: z.string().regex(/^\d{2}$/), name: z.string().trim().min(2).max(100).optional(), enabled: z.boolean().optional() }).parse(input);
    return prisma.$transaction(async (tx) => {
      const result = await tx.province.update({ where: { code: data.code }, data: { name: data.name, enabled: data.enabled } });
      await audit(tx, adminId, "UPDATE_PROVINCE", data.code, data);
      return result;
    });
  }
  if (resource === "donate" && method === "PUT") {
    const data = donateSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const result = await tx.donateConfig.upsert({ where: { id: 1 }, create: { ...data, id: 1 }, update: data });
      await audit(tx, adminId, "UPDATE_DONATE", "1", data);
      return result;
    });
  }
  if (resource === "ratings" && id && method === "PATCH") {
    const data = z.object({ hidden: z.boolean().optional(), noShowStatus: z.enum(["CONFIRMED", "DISMISSED"]).optional() }).parse(input);
    return prisma.$transaction(async (tx) => {
      const old = await tx.rating.findUniqueOrThrow({ where: { id } });
      assert(!data.noShowStatus || old.noShow, 422, "INVALID_RATING", "Đánh giá này không báo bùng kèo.");
      const result = await tx.rating.update({ where: { id }, data });
      await recalculateReputation(tx, result.ratedUserId);
      await audit(tx, adminId, "MODERATE_RATING", id, data);
      return result;
    }, { isolationLevel: "Serializable" });
  }
  if (resource === "venues") {
    if (method === "DELETE" && id) return prisma.$transaction(async (tx) => {
      await tx.venue.delete({ where: { id } }); await audit(tx, adminId, "DELETE_VENUE", id, {}); return { success: true };
    });
    if (method === "POST" && (input as { csv?: unknown })?.csv) {
      const { csv } = z.object({ csv: z.string().min(1).max(500000) }).parse(input);
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
      assert(!parsed.errors.length && parsed.data.length <= 500, 422, "INVALID_CSV", "CSV không hợp lệ hoặc vượt quá 500 sân.");
      const formatMap: Record<string, string> = { "5": "FIVE", "7": "SEVEN", "11": "ELEVEN" };
      const rows = parsed.data.map((r) => venueSchema.parse({ name: r.name, address: r.address, provinceCode: r.province_code?.padStart(2, "0"), lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null, formats: r.formats?.split("|").map((v) => formatMap[v.trim()] ?? v.trim()), phone: r.phone || null }));
      return prisma.$transaction(async (tx) => {
        for (const row of rows) { const normalizedName = row.name.toLocaleLowerCase("vi"); await tx.venue.upsert({ where: { provinceCode_normalizedName: { provinceCode: row.provinceCode, normalizedName } }, create: { ...row, normalizedName, status: "APPROVED", createdById: adminId }, update: { ...row, status: "APPROVED" } }); }
        await audit(tx, adminId, "IMPORT_VENUES", "csv", { count: rows.length }); return { imported: rows.length };
      }, { timeout: 30000 });
    }
    if (method === "POST" || (method === "PATCH" && id)) {
      const parsed = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }).parse(input);
      const fields = (input && typeof input === "object" ? Object.keys(input).filter((k) => k !== "status") : []);
      const data = fields.length ? venueSchema.parse(input) : undefined;
      assert(method !== "POST" || data, 422, "INVALID_VENUE", "Cần nhập thông tin sân.");
      return prisma.$transaction(async (tx) => {
        const values = data ? { ...data, normalizedName: data.name.toLocaleLowerCase("vi") } : {};
        const result = id ? await tx.venue.update({ where: { id }, data: { ...values, status: parsed.status } }) : await tx.venue.create({ data: { ...data!, normalizedName: data!.name.toLocaleLowerCase("vi"), status: parsed.status ?? "APPROVED", createdById: adminId } });
        await audit(tx, adminId, "UPDATE_VENUE", result.id, { ...values, status: parsed.status }); return result;
      });
    }
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.");
}
