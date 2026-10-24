import type { Prisma } from "@prisma/client";

export async function lockAdminChanges(tx: Prisma.TransactionClient) {
  // The migration creates this singleton. InnoDB releases its lock on commit/rollback.
  await tx.$queryRaw`SELECT id FROM DatabaseLock WHERE id = 1 FOR UPDATE`;
}
