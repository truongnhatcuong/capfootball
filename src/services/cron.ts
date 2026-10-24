import { prisma } from "@/lib/prisma";
import { notify } from "./notify";
import { recalculateReputation } from "./ratings";
export async function tick() {
  const now = new Date();
  const expired = await prisma.match.updateMany({ where: { status: { in: ["OPEN", "PENDING"] }, kickoffAt: { lte: now } }, data: { status: "EXPIRED" } });
  await prisma.matchRequest.updateMany({ where: { status: "PENDING", match: { status: "EXPIRED" } }, data: { status: "CANCELLED" } });
  const matches = await prisma.match.findMany({ where: { status: "MATCHED", hidden: false, OR: [{ reminderSentAt: null, kickoffAt: { gt: now, lte: new Date(now.getTime() + 2 * 3600000) } }, { ratingPromptSentAt: null, kickoffAt: { lte: new Date(now.getTime() - 3 * 3600000) } }] }, include: { requests: { where: { status: "ACCEPTED" } } }, take: 100, orderBy: { kickoffAt: "asc" } });
  for (const match of matches) {
    const isRating = match.kickoffAt.getTime() <= now.getTime() - 3 * 3600000;
    for (const userId of [match.ownerId, ...match.requests.map((r) => r.userId)]) {
      await notify(userId, isRating ? "RATE_PROMPT" : "MATCH_REMINDER", { title: isRating ? "Trận đấu thế nào? Hãy đánh giá đối thủ." : "Sắp đến giờ ra sân!", url: `/matches/${match.id}${isRating ? "?rate=1" : ""}`, key: `${isRating ? "rating" : "reminder"}:${match.id}:${userId}` });
    }
    await prisma.match.update({ where: { id: match.id }, data: isRating ? { ratingPromptSentAt: now } : { reminderSentAt: now } });
  }
  const due = await prisma.rating.findMany({ where: { noShowStatus: "PENDING", hidden: false, createdAt: { lte: new Date(now.getTime() - 72 * 3600000) } }, take: 100 });
  for (const r of due) await prisma.$transaction(async (tx) => {
    await tx.rating.updateMany({ where: { id: r.id, noShowStatus: "PENDING" }, data: { noShowStatus: "CONFIRMED" } });
    await recalculateReputation(tx, r.ratedUserId);
  }, { isolationLevel: "Serializable" });
  // Decay cached 90-day no-show counts even when no new ratings arrive.
  const warned = await prisma.user.findMany({ where: { noShowCount: { gt: 0 } }, select: { id: true }, take: 1000 });
  for (const u of warned) await prisma.$transaction((tx) => recalculateReputation(tx, u.id));
  return { expired: expired.count, notifiedMatches: matches.length, processedNoShows: due.length };
}
