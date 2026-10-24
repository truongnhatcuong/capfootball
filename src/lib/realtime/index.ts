import Pusher from "pusher";
import { getRedis } from "../ratelimit";
import { createRealtimeToken } from "./token";
import { logger } from "../logger";
export interface RealtimeProvider {
  publish(channel: string, event: string, payload: unknown): Promise<void>;
  authorize(userId: string, channel: string, socketId?: string): Promise<unknown>;
}
let pusher: Pusher | undefined;
function getPusher() {
  return pusher ??= new Pusher({ appId: process.env.PUSHER_APP_ID!, key: process.env.NEXT_PUBLIC_PUSHER_KEY!, secret: process.env.PUSHER_SECRET!, cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!, useTLS: true });
}
export const realtime: RealtimeProvider = {
  async publish(channel, event, payload) {
    try {
      if (process.env.REALTIME_DRIVER === "pusher") await getPusher().trigger(channel, event, payload);
      else if (process.env.REALTIME_DRIVER === "socketio") await getRedis()?.publish("capfootball:events", JSON.stringify({ channel, event, payload }));
    } catch { logger.warn({ channel, event }, "Realtime delivery failed; clients can poll persisted data"); }
  },
  async authorize(userId, channel, socketId) {
    if (process.env.REALTIME_DRIVER === "pusher") {
      if (!socketId) throw new Error("socket_id is required");
      return getPusher().authorizeChannel(socketId, channel);
    }
    return { token: createRealtimeToken(userId, channel) };
  },
};
