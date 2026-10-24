import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assert } from "@/lib/errors";
import { ratingSchema } from "@/schemas";
import { notify } from "./notify";
export async function recalculateReputation(tx: Prisma.TransactionClient, userId: string) {
  const aggregate = await tx.rating.aggregate({ where: { ratedUserId: userId, happened: true, hidden: false, stars: { not: null } }, _avg: { stars: true }, _count: { stars: true } });
  const noShowCount = await tx.rating.count({ where: { ratedUserId: userId, hidden: false, noShowStatus: "CONFIRMED", createdAt: { gte: new Date(Date.now() - 90 * 86400000) } } });
  await tx.user.update({ where: { id: userId }, data: { ratingAvg: aggregate._avg.stars, ratingCount: aggregate._count.stars, noShowCount } });
}
export async function rateMatch(matchId: string, raterId: string, input: unknown) {
  const data = ratingSchema.parse(input);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`Match\` WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { requests: { where: { status: "ACCEPTED" } } } });
    const accepted = match?.requests[0];
    assert(match && match.status === "MATCHED" && accepted && !match.hidden, 409, "INVALID_MATCH", "Chỉ đánh giá kèo đã chốt.");
    assert(match.kickoffAt.getTime() + 3 * 3600000 <= Date.now(), 409, "TOO_EARLY", "Có thể đánh giá sau giờ đá 3 tiếng.");
    assert(raterId === match.ownerId || raterId === accepted.userId, 403, "FORBIDDEN", "Chỉ hai bên của trận đấu được đánh giá.");
    const ratedUserId = raterId === match.ownerId ? accepted.userId : match.ownerId;
    const old = await tx.rating.findUnique({ where: { matchId_raterId: { matchId, raterId } } });
    assert(!old || (!old.hidden && ["NONE", "PENDING"].includes(old.noShowStatus) && Date.now() - old.createdAt.getTime() <= 86400000), 409, "EDIT_WINDOW_CLOSED", "Đánh giá đã quá hạn sửa hoặc đã được xử lý.");
    const other = await tx.rating.findUnique({ where: { matchId_raterId: { matchId, raterId: ratedUserId } } });
    const disputed = data.noShow && other?.noShow;
    const rating = await tx.rating.upsert({ where: { matchId_raterId: { matchId, raterId } }, create: { ...data, matchId, raterId, ratedUserId, noShowStatus: data.noShow ? disputed ? "DISPUTED" : "PENDING" : "NONE" }, update: { ...data, noShowStatus: data.noShow ? disputed ? "DISPUTED" : "PENDING" : "NONE" } });
    if (disputed && other) await tx.rating.update({ where: { id: other.id }, data: { noShowStatus: "DISPUTED" } });
    await recalculateReputation(tx, ratedUserId);
    if (disputed) await recalculateReputation(tx, raterId);
    return rating;
  }, { isolationLevel: "Serializable" });
  if (result.noShow) await notify(result.ratedUserId, "SYSTEM", { title: "Bạn nhận được báo cáo bùng kèo", body: "Bạn có 72 giờ để phản bác trong trang chi tiết trận.", url: `/matches/${matchId}?rate=1`, key: `no-show:${result.id}` });
  return result;
}
export async function disputeRating(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.rating.findUnique({ where: { id } });
    assert(old && old.ratedUserId === userId, 404, "NOT_FOUND", "Không tìm thấy đánh giá.");
    assert(old.noShowStatus === "PENDING" && old.createdAt.getTime() + 72 * 3600000 > Date.now(), 409, "INVALID_STATE", "Báo cáo đã được xử lý hoặc hết hạn phản bác.");
    const changed = await tx.rating.updateMany({ where: { id, noShowStatus: "PENDING" }, data: { noShowStatus: "DISPUTED" } });
    assert(changed.count === 1, 409, "CONFLICT", "Đánh giá vừa thay đổi. Vui lòng tải lại.");
    await tx.report.create({ data: { reporterId: userId, targetType: "RATING", targetId: id, reason: "Người được đánh giá phản bác báo cáo bùng kèo." } });
    return { success: true };
  });
}
