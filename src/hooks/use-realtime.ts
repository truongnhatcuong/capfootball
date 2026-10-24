"use client";
import { useEffect, useRef } from "react";
export function useRealtime(channel: string | undefined, event: string, onEvent: () => void) {
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; }, [onEvent]);
  useEffect(() => {
    if (!channel) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    async function connect() {
      if (process.env.NEXT_PUBLIC_PUSHER_KEY) {
        const { default: Pusher } = await import("pusher-js");
        if (disposed) return;
        const client = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1", channelAuthorization: { endpoint: "/api/realtime/auth", transport: "ajax" } });
        client.subscribe(channel!).bind(event, () => callback.current());
        cleanup = () => client.disconnect();
      }
    }
    void connect().catch(() => { /* Polling fallback is always active. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [channel, event]);
}
