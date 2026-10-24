import { lockAdminChanges } from "@/lib/db-lock";
import { prisma } from "@/lib/prisma";
import { assert } from "@/lib/errors";
import { profileSchema } from "@/schemas";
import type { Prisma } from "@prisma/client";

export async function profileZaloPhone(userId: string, viewerId?: string | null) {
  if (!viewerId) return null;
  // Keep consent and participant checks in the same query as the private field.
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      deletedAt: null,
      ...(viewerId === userId ? {} : {
        zaloConsentAt: { not: null },
        OR: [
          { matches: { some: {
            status: "MATCHED", hidden: false,
            requests: { some: { userId: viewerId, status: "ACCEPTED", user: { status: "ACTIVE", deletedAt: null } } },
          } } },
          { requests: { some: {
            status: "ACCEPTED",
            match: { status: "MATCHED", hidden: false, ownerId: viewerId, owner: { status: "ACTIVE", deletedAt: null } },
          } } },
        ],
      }),
    },
    select: { zaloPhone: true },
  });
  return user?.zaloPhone ?? null;
}

export async function updateProfile(userId: string, input: unknown) {
  const data = profileSchema.parse(input);
  if (data.provinceCode) assert(await prisma.province.findFirst({ where: { code: data.provinceCode, enabled: true } }), 422, "INVALID_PROVINCE", "Tỉnh/thành chưa được hỗ trợ.");
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const zaloPhone = data.zaloPhone === "" ? null : data.zaloPhone;
  const effectivePhone = zaloPhone === undefined ? current.zaloPhone : zaloPhone;
  assert(!data.zaloConsent || effectivePhone, 422, "PHONE_REQUIRED", "Vui lòng nhập số Zalo trước khi cho phép chia sẻ.");
  const consent = data.zaloConsent === false || effectivePhone == null || (zaloPhone !== undefined && zaloPhone !== current.zaloPhone && data.zaloConsent !== true) ? null : data.zaloConsent === true ? new Date() : current.zaloConsentAt;
  return prisma.user.update({ where: { id: userId }, data: { name: data.name, provinceCode: data.provinceCode, zaloPhone, zaloConsentAt: consent, emailNotifications: data.emailNotifications, ...(data.acceptTerms ? { termsAcceptedAt: current.termsAcceptedAt ?? new Date() } : {}) } });
}
export async function cancelUserMatches(tx: Prisma.TransactionClient, userId: string) {
  const affected = await tx.match.findMany({ where: { kickoffAt: { gt: new Date() }, status: { in: ["OPEN", "PENDING", "MATCHED"] }, OR: [{ ownerId: userId }, { requests: { some: { userId, status: "ACCEPTED" } } }] }, select: { id: true, ownerId: true, requests: { where: { status: { in: ["PENDING", "ACCEPTED"] } }, select: { userId: true } } } });
  for (const m of affected) {
    await tx.match.update({ where: { id: m.id }, data: { status: "CANCELLED" } });
    await tx.matchRequest.updateMany({ where: { matchId: m.id, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
    for (const recipient of new Set([m.ownerId, ...m.requests.map((r) => r.userId)].filter((id) => id !== userId))) await tx.notification.upsert({ where: { dedupeKey: `account-cancel:${m.id}:${recipient}` }, create: { userId: recipient, type: "SYSTEM", title: "Kèo đã hủy do một tài khoản ngừng hoạt động", url: `/matches/${m.id}`, dedupeKey: `account-cancel:${m.id}:${recipient}` }, update: {} });
  }
  await tx.matchRequest.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED" } });
}
export async function deleteProfile(userId: string) {
  await prisma.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (current.role === "ADMIN") assert(await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE", deletedAt: null } }) > 1, 409, "LAST_ADMIN", "Hãy cấp quyền cho quản trị viên khác trước khi xóa tài khoản.");
    await cancelUserMatches(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { name: "Người dùng đã xóa", email: null, emailVerified: null, phone: null, image: null, zaloPhone: null, zaloConsentAt: null, provinceCode: null, deletedAt: new Date(), role: "USER", status: "BANNED", emailNotifications: false } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
