import { createHmac, timingSafeEqual } from "node:crypto";
type Claims = { userId: string; channel: string; exp: number };
function secret() { if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required"); return process.env.AUTH_SECRET; }
export function createRealtimeToken(userId: string, channel: string) {
  const payload = Buffer.from(JSON.stringify({ userId, channel, exp: Date.now() + 60_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export function verifyRealtimeToken(token: string): Claims | null {
  try {
    const [payload, signature] = token.split(".");
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.exp > Date.now() && typeof claims.userId === "string" && typeof claims.channel === "string" ? claims : null;
  } catch { return null; }
}
