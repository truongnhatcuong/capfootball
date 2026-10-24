import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: session }));
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/guards";
let userId: string;
beforeAll(async () => {
  if (!/test|e2e/.test(new URL(process.env.DATABASE_URL ?? "").pathname)) throw new Error("Use a dedicated test database.");
  const user = await prisma.user.create({ data: { name: "Guard test", email: `guard-${Date.now()}@example.test` } }); userId = user.id;
});
beforeEach(async () => { await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE", role: "USER", deletedAt: null, termsAcceptedAt: null } }); session.mockResolvedValue({ user: { id: userId } }); });
afterAll(async () => { if (userId) await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect(); });
describe.sequential("database-backed authorization guards", () => {
  it("rejects anonymous visitors", async () => { session.mockResolvedValue(null); await expect(requireUser()).rejects.toMatchObject({ status: 401 }); });
  it("allows profile access before consent but blocks business writes", async () => { expect((await requireUser()).id).toBe(userId); await expect(requireUser(true)).rejects.toMatchObject({ code: "CONSENT_REQUIRED" }); });
  it("blocks a banned user even when a session still exists", async () => { await prisma.user.update({ where: { id: userId }, data: { status: "BANNED" } }); await expect(requireUser()).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" }); });
  it("blocks a deleted user even when a session still exists", async () => { await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }); await expect(requireUser()).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" }); });
  it("uses the current database role for administration", async () => { await expect(requireAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" }); await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } }); expect((await requireAdmin()).role).toBe("ADMIN"); });
});
