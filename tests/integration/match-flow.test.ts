import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/services/notify", () => ({ notify: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/realtime", () => ({ realtime: { publish: vi.fn().mockResolvedValue(undefined) } }));
import { prisma } from "@/lib/prisma";
import { createMatch, requestMatch, decideRequest, matchDetail, updateMatch, listMatches } from "@/services/matches";
import { getMessages, sendMessage } from "@/services/conversations";
import { rateMatch, disputeRating } from "@/services/ratings";
import { updateProfile, deleteProfile, profileZaloPhone } from "@/services/profile";

const prefix = `integration-${Date.now()}`;
let owner: Awaited<ReturnType<typeof prisma.user.create>>, alice: typeof owner, bob: typeof owner, stranger: typeof owner;
let matchId: string;
beforeAll(async () => {
  if (!/test|e2e/.test(new URL(process.env.DATABASE_URL ?? "").pathname)) throw new Error("Integration tests require a dedicated database whose name includes test or e2e.");
  await prisma.province.upsert({ where: { code: "99" }, create: { code: "99", name: "Tỉnh kiểm thử", slug: "test-province" }, update: {} });
  const users = await Promise.all(["owner", "alice", "bob", "stranger"].map((name) => prisma.user.create({ data: { name: `${prefix}-${name}`, email: `${prefix}-${name}@example.test`, termsAcceptedAt: new Date(), zaloPhone: "0912345678", zaloConsentAt: new Date() } })));
  [owner, alice, bob, stranger] = users;
});
afterAll(async () => {
  if (!owner) return;
  const userIds = [owner.id, alice.id, bob.id, stranger.id];
  const matches = await prisma.match.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const matchIds = matches.map((m) => m.id);
  await prisma.conversation.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.rating.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.report.deleteMany({ where: { reporterId: { in: userIds } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
describe.sequential("transactional match flow against MySQL", () => {
  it("stores venue formats as JSON and filters by a supported format", async () => {
    const venue = await prisma.venue.create({ data: { name: prefix, normalizedName: prefix, address: "a".repeat(250), provinceCode: "99", formats: ["FIVE", "SEVEN"], status: "APPROVED" } });
    try {
      const supported = await prisma.venue.findMany({ where: { id: venue.id, formats: { array_contains: "SEVEN" } } });
      expect(supported).toHaveLength(1);
      expect(supported[0].formats).toEqual(["FIVE", "SEVEN"]);
      expect(await prisma.venue.count({ where: { id: venue.id, formats: { array_contains: "ELEVEN" } } })).toBe(0);
    } finally { await prisma.venue.delete({ where: { id: venue.id } }); }
  });
  it("creates a match and never includes private contacts in the public feed", async () => {
    const match = await createMatch(owner.id, { title: `${prefix} giao hữu`, skill: "AVERAGE", format: "SEVEN", kickoffAt: new Date(Date.now() + 86400000).toISOString(), venue: "Sân kiểm thử", provinceCode: "99" });
    matchId = match.id;
    const feed = await listMatches({ province: "99" });
    const item = feed.data.find((m) => m.id === match.id)!;
    expect(item.owner).not.toHaveProperty("email"); expect(item.owner).not.toHaveProperty("zaloPhone");
    expect((await matchDetail(matchId, stranger)).zaloPhone).toBeNull();
    expect(await profileZaloPhone(owner.id)).toBeNull();
    expect(await profileZaloPhone(owner.id, alice.id)).toBeNull();
    expect((await listMatches({ province: "99", q: prefix.toUpperCase() })).data.some((m) => m.id === matchId)).toBe(true);
    await expect(prisma.match.update({ where: { id: matchId }, data: { skillMax: "WEAK" } })).rejects.toThrow();
  });
  it("forbids receiving one's own match and editing someone else's match", async () => {
    await expect(requestMatch(matchId, owner.id)).rejects.toMatchObject({ code: "OWN_MATCH" });
    await expect(updateMatch(matchId, alice.id, { title: "Chiếm kèo" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("creates private conversation, rejects unauthorized history and blocks messaging", async () => {
    const result = await requestMatch(matchId, alice.id, "Đội mình trình TB");
    await expect(getMessages(result.conversationId, stranger.id, {})).rejects.toMatchObject({ status: 404 });
    await sendMessage(result.conversationId, alice.id, "Chào chủ kèo!");
    expect((await getMessages(result.conversationId, owner.id, {})).data).toHaveLength(1);
    await prisma.userBlock.create({ data: { blockerId: owner.id, blockedId: alice.id } });
    await expect(sendMessage(result.conversationId, alice.id, "Có ai không?")).rejects.toMatchObject({ code: "BLOCKED" });
    await prisma.userBlock.delete({ where: { blockerId_blockedId: { blockerId: owner.id, blockedId: alice.id } } });
  });
  it("allows exactly one acceptance under concurrent requests and reveals Zalo only to its partner", async () => {
    const existing = await prisma.matchRequest.findUniqueOrThrow({ where: { matchId_userId: { matchId, userId: alice.id } } });
    const second = await requestMatch(matchId, bob.id);
    await expect(decideRequest(existing.id, stranger.id, "ACCEPTED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const results = await Promise.allSettled([decideRequest(existing.id, owner.id, "ACCEPTED"), decideRequest(second.request.id, owner.id, "ACCEPTED")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.matchRequest.count({ where: { matchId, status: "ACCEPTED" } })).toBe(1);
    const rejected = await prisma.matchRequest.findFirstOrThrow({ where: { matchId, status: "REJECTED" } });
    await expect(prisma.matchRequest.update({ where: { id: rejected.id }, data: { status: "ACCEPTED" } })).rejects.toMatchObject({ code: "P2002" });
    const winner = await prisma.matchRequest.findFirstOrThrow({ where: { matchId, status: "ACCEPTED" } });
    const winnerUser = winner.userId === alice.id ? alice : bob, loser = winner.userId === alice.id ? bob : alice;
    expect((await matchDetail(matchId, winnerUser)).zaloPhone).toBe("0912345678");
    expect((await matchDetail(matchId, loser)).zaloPhone).toBeNull();
    expect(await profileZaloPhone(owner.id, winnerUser.id)).toBe("0912345678");
    expect(await profileZaloPhone(winnerUser.id, owner.id)).toBe("0912345678");
    expect(await profileZaloPhone(owner.id, loser.id)).toBeNull();
    expect(await profileZaloPhone(owner.id, stranger.id)).toBeNull();
    await updateProfile(owner.id, { zaloConsent: false });
    expect((await matchDetail(matchId, winnerUser)).zaloPhone).toBeNull();
    expect(await profileZaloPhone(owner.id, winnerUser.id)).toBeNull();
    expect(await profileZaloPhone(owner.id, owner.id)).toBe("0912345678");
  });
  it("enforces post-match timing, prevents outsiders rating and supports no-show disputes", async () => {
    const accepted = await prisma.matchRequest.findFirstOrThrow({ where: { matchId, status: "ACCEPTED" } });
    await expect(rateMatch(matchId, owner.id, { happened: true, stars: 5 })).rejects.toMatchObject({ code: "TOO_EARLY" });
    await prisma.match.update({ where: { id: matchId }, data: { kickoffAt: new Date(Date.now() - 4 * 3600000) } });
    await expect(rateMatch(matchId, stranger.id, { happened: true, stars: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rating = await rateMatch(matchId, owner.id, { happened: false, noShow: true, comment: "Đối thủ không xuất hiện tại sân" });
    expect(rating.noShowStatus).toBe("PENDING");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: accepted.userId } })).noShowCount).toBe(0);
    await disputeRating(rating.id, accepted.userId);
    expect((await prisma.rating.findUniqueOrThrow({ where: { id: rating.id } })).noShowStatus).toBe("DISPUTED");
  });
  it("anonymizes deleted accounts and revokes all sessions", async () => {
    await prisma.session.create({ data: { sessionToken: `${prefix}-session`, userId: stranger.id, expires: new Date(Date.now() + 86400000) } });
    await deleteProfile(stranger.id);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: stranger.id } });
    expect(deleted.email).toBeNull(); expect(deleted.zaloPhone).toBeNull(); expect(deleted.deletedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: stranger.id } })).toBe(0);
  });
});
