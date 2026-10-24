import { createServer } from "node:http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { verifyRealtimeToken } from "./src/lib/realtime/token";

// Run alongside the standalone Next app. Redis is the cross-process event bridge.
if (!process.env.REDIS_URL || !process.env.AUTH_URL || !process.env.AUTH_SECRET) throw new Error("REDIS_URL, AUTH_URL and AUTH_SECRET are required");
const db = new PrismaClient();
const http = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"status":"ok"}'); });
const io = new Server(http, { cors: { origin: new URL(process.env.AUTH_URL).origin, methods: ["GET", "POST"] }, maxHttpBufferSize: 4096 });
const subscriber = new Redis(process.env.REDIS_URL);
void subscriber.subscribe("capfootball:events");
subscriber.on("message", (_channel, raw) => {
  try { const { channel, event, payload } = JSON.parse(raw); io.to(channel).emit(event, payload); } catch { /* Only internal Redis messages are accepted. */ }
});
io.on("connection", (socket) => {
  const deadline = setTimeout(() => { if (socket.rooms.size <= 1) socket.disconnect(true); }, 10000);
  socket.on("subscribe", async (token: unknown) => {
    try {
      if (typeof token !== "string" || token.length > 1500) return socket.disconnect(true);
      const claims = verifyRealtimeToken(token);
      if (!claims) return socket.disconnect(true);
      const user = await db.user.findFirst({ where: { id: claims.userId, status: "ACTIVE", deletedAt: null } });
      if (!user) return socket.disconnect(true);
      const allowed = claims.channel === `private-user-${user.id}` || (claims.channel.startsWith("private-conv-") && await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: claims.channel.slice(13), userId: user.id } } }));
      if (!allowed) return socket.disconnect(true);
      await socket.join(claims.channel); socket.data.userId = user.id; clearTimeout(deadline);
    } catch { socket.disconnect(true); }
  });
  // Long-lived sockets recheck account state so banning/deleting a user revokes access.
  const audit = setInterval(async () => {
    try { if (socket.data.userId && !await db.user.findFirst({ where: { id: socket.data.userId, status: "ACTIVE", deletedAt: null }, select: { id: true } })) socket.disconnect(true); } catch { socket.disconnect(true); }
  }, 30000);
  socket.on("disconnect", () => { clearTimeout(deadline); clearInterval(audit); });
});
http.listen(Number(process.env.SOCKET_PORT ?? 3001), "0.0.0.0", () => console.info("Realtime service listening"));
async function shutdown() { await new Promise<void>((resolve) => io.close(() => resolve())); await subscriber.quit(); await db.$disconnect(); process.exit(0); }
process.on("SIGTERM", () => void shutdown()); process.on("SIGINT", () => void shutdown());
