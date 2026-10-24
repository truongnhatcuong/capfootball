import { prisma } from "@/lib/prisma";
import { assert } from "@/lib/errors";
import { assertNotBlocked } from "@/lib/blocks";
import { publicUserSelect, publicUser } from "@/lib/public-user";
import { pageResult, pageSchema, cursorWhere } from "@/lib/pagination";
import { realtime } from "@/lib/realtime";
import { notify } from "./notify";
export async function conversationAccess(id: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id, members: { some: { userId } } }, include: { members: { include: { user: { select: { ...publicUserSelect, status: true, deletedAt: true } } } }, match: { select: { id: true, title: true, status: true, ownerId: true, hidden: true } } } });
  assert(conversation, 404, "NOT_FOUND", "Không tìm thấy hội thoại.");
  return conversation;
}
export async function listConversations(userId: string, query: Record<string, string>) {
  const { cursor, limit } = pageSchema.parse(query);
  const rows = await prisma.conversation.findMany({ where: { members: { some: { userId } }, ...cursorWhere(cursor) }, include: { match: { select: { id: true, title: true, status: true } }, members: { include: { user: { select: publicUserSelect } } }, messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
  const data = await Promise.all(rows.map(async (c) => {
    const me = c.members.find((m) => m.userId === userId)!;
    const unreadCount = await prisma.message.count({ where: { conversationId: c.id, senderId: { not: userId }, ...(me.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}) } });
    return { ...c, members: c.members.map((m) => ({ ...m, user: publicUser(m.user) })), unreadCount };
  }));
  return pageResult(data, limit);
}
export async function getMessages(id: string, userId: string, query: Record<string, string>) {
  const conversation = await conversationAccess(id, userId);
  const { cursor, limit } = pageSchema.parse(query);
  // Record the read boundary before fetching. A message arriving during this query stays unread.
  const readAt = new Date();
  const rows = await prisma.message.findMany({ where: { conversationId: id, ...cursorWhere(cursor) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
  if (!cursor) await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { lastReadAt: readAt } });
  return { ...pageResult(rows, limit), conversation: { ...conversation, members: conversation.members.map((m) => ({ userId: m.userId, user: publicUser({ id: m.user.id, name: m.user.name, image: m.user.image, ratingAvg: m.user.ratingAvg, ratingCount: m.user.ratingCount, noShowCount: m.user.noShowCount, createdAt: m.user.createdAt }) })) } };
}
export async function sendMessage(id: string, userId: string, body: string) {
  const conversation = await conversationAccess(id, userId);
  const partner = conversation.members.find((m) => m.userId !== userId);
  assert(partner && !partner.user.deletedAt && partner.user.status === "ACTIVE", 409, "PARTNER_UNAVAILABLE", "Người dùng không còn hoạt động.");
  await assertNotBlocked(userId, partner.userId);
  assert(!conversation.match.hidden, 403, "MATCH_HIDDEN", "Kèo đã bị ẩn.");
  assert(!/(cá\s*độ|cược\s*tiền|đánh\s*bạc|bit\.ly\/|tinyurl\.com\/)/iu.test(body), 422, "CONTENT_BLOCKED", "Nội dung có dấu hiệu cá cược hoặc liên kết không an toàn.");
  const message = await prisma.message.create({ data: { conversationId: id, senderId: userId, body } });
  await realtime.publish(`private-conv-${id}`, "message", { id: message.id });
  const slot = Math.floor(Date.now() / 900000);
  await notify(partner.userId, "NEW_MESSAGE", { title: "Bạn có tin nhắn mới", url: `/messages/${id}`, key: `message:${id}:${partner.userId}:${slot}` });
  return message;
}
