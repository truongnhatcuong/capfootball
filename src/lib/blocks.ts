import { prisma } from "./prisma";
import { assert } from "./errors";
export async function assertNotBlocked(a: string, b: string) {
  const block = await prisma.userBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } });
  assert(!block, 403, "BLOCKED", "Không thể liên hệ với người dùng này.");
}
