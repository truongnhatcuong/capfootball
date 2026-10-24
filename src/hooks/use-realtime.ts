"use client";
import { useEffect, useRef } from "react";
import { api, json } from "@/lib/client";
export function useRealtime(channel: string | undefined, event: string, onEvent: () => void) {
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; }, [onEvent]);
  useEffect(() => {
    if (!channel) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    async function connect() {
      if (process.env.NEXT_PUBLIC_REALTIME_DRIVER === "pusher" && process.env.NEXT_PUBLIC_PUSHER_KEY) {
        const { default: Pusher } = await import("pusher-js");
        if (disposed) return;
        const client = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!, channelAuthorization: { endpoint: "/api/realtime/auth", transport: "ajax" } });
        client.subscribe(channel!).bind(event, () => callback.current());
        cleanup = () => client.disconnect();
      } else if (process.env.NEXT_PUBLIC_REALTIME_DRIVER === "socketio") {
        const { io } = await import("socket.io-client");
        const client = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, { path: "/socket.io", autoConnect: false });
        cleanup = () => { client.disconnect(); };
        if (disposed) { cleanup(); return; }
        client.on("connect", async () => {
          try { const { token } = await api<{ token: string }>("/api/realtime/auth", json("POST", { channel_name: channel })); if (!disposed) client.emit("subscribe", token); } catch { /* Polling continues if realtime is unavailable. */ }
        });
        client.on(event, () => callback.current());
        client.connect();
      }
    }
    void connect().catch(() => { /* Polling fallback is always active. */ });
    return () => { disposed = true; cleanup?.(); };
  }, [channel, event]);
}
