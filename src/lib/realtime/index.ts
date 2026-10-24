import Pusher from "pusher";
import { AppError } from "../errors";
import { logger } from "../logger";
export interface RealtimeProvider {
  publish(channel: string, event: string, payload: unknown): Promise<void>;
  authorize(channel: string, socketId: string): Promise<unknown>;
}
let pusher: Pusher | undefined;
function getPusher() {
  if (!process.env.PUSHER_APP_ID || !process.env.NEXT_PUBLIC_PUSHER_KEY || !process.env.PUSHER_SECRET) {
    throw new AppError(503, "REALTIME_UNAVAILABLE", "Chưa cấu hình Pusher. Vui lòng thử lại sau.");
  }
  return pusher ??= new Pusher({ appId: process.env.PUSHER_APP_ID, key: process.env.NEXT_PUBLIC_PUSHER_KEY, secret: process.env.PUSHER_SECRET, cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1", useTLS: true });
}
export const realtime: RealtimeProvider = {
  async publish(channel, event, payload) {
    try {
      await getPusher().trigger(channel, event, payload);
    } catch { logger.warn({ channel, event }, "Realtime delivery failed; clients can poll persisted data"); }
  },
  async authorize(channel, socketId) {
    return getPusher().authorizeChannel(socketId, channel);
  },
};
