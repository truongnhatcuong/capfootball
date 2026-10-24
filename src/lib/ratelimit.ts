import Redis from "ioredis";
import { AppError } from "./errors";
import { logger } from "./logger";
const globalRedis = globalThis as unknown as { redis?: Redis };
export function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!globalRedis.redis) {
    globalRedis.redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
    globalRedis.redis.on("error", () => logger.warn("Redis connection unavailable"));
  }
  return globalRedis.redis;
}
const buckets = new Map<string, { count: number; reset: number }>();
export async function rateLimit(key: string, limit: number, windowSeconds = 60) {
  const redis = getRedis();
  let count: number;
  if (redis) {
    try {
      count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `rate:${key}`, windowSeconds));
    } catch { throw new AppError(503, "RATE_LIMIT_UNAVAILABLE", "Dịch vụ đang bận. Vui lòng thử lại."); }
  } else {
    if (process.env.NODE_ENV === "production") throw new AppError(503, "RATE_LIMIT_UNAVAILABLE", "Chưa cấu hình dịch vụ giới hạn truy cập.");
    const now = Date.now();
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) { bucket = { count: 0, reset: now + windowSeconds * 1000 }; buckets.set(key, bucket); }
    count = ++bucket.count;
  }
  if (count > limit) throw new AppError(429, "RATE_LIMITED", "Thao tác quá nhanh. Vui lòng thử lại sau.");
}
