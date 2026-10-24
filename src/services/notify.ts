import type { NotificationType } from "@prisma/client";
import webPush from "web-push";
import { prisma } from "@/lib/prisma";
import { realtime } from "@/lib/realtime";
import { logger } from "@/lib/logger";
import { getMailTransport } from "@/lib/mail";
type Payload = { title: string; body?: string; url?: string; key: string };
export async function notify(userId: string, type: NotificationType, payload: Payload) {
  const existing = await prisma.notification.findUnique({ where: { dedupeKey: payload.key } });
  if (existing) return existing;
  const notification = await prisma.notification.upsert({ where: { dedupeKey: payload.key }, create: { userId, type, title: payload.title, body: payload.body, url: payload.url, dedupeKey: payload.key }, update: {} });
  await realtime.publish(`private-user-${userId}`, "notification", { id: notification.id });
  await Promise.allSettled([sendPush(userId, notification), sendEmail(userId, type, payload)]);
  return notification;
}
async function sendPush(userId: string, notification: { title: string; body: string | null; url: string | null }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return;
  webPush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(subscriptions.map(async (s) => {
    try { await webPush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notification), { TTL: 3600 }); }
    catch (error) {
      if ([404, 410].includes((error as { statusCode: number }).statusCode)) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
      else logger.warn({ subscriptionId: s.id }, "Push delivery failed");
    }
  }));
}
async function sendEmail(userId: string, type: NotificationType, payload: Payload) {
  // Message content never leaves the app in email; other event emails are opt-in through profile.
  if (type === "NEW_MESSAGE") return;
  const transport = getMailTransport();
  if (!transport) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailNotifications: true, deletedAt: true, status: true } });
  if (!user?.email || !user.emailNotifications || user.deletedAt || user.status !== "ACTIVE") return;
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: payload.title,
      text: `${payload.title}\n${payload.body ?? ""}\n${process.env.AUTH_URL ?? ""}${payload.url ?? "/notifications"}`,
    });
  } catch {
    logger.warn("SMTP email delivery failed");
  }
}
