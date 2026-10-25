import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  matchDetail: vi.fn(),
  findRatings: vi.fn(),
  rateMatch: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { rating: { findMany: mocks.findRatings } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser: mocks.requireUser, requireAdmin: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/services/matches", () => ({
  matchDetail: mocks.matchDetail,
  listMatches: vi.fn(), createMatch: vi.fn(), updateMatch: vi.fn(),
  requestMatch: vi.fn(), decideRequest: vi.fn(),
}));
vi.mock("@/services/ratings", () => ({ rateMatch: mocks.rateMatch, disputeRating: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ realtime: {} }));

import { GET, POST } from "@/app/api/[...path]/route";
import { AppError } from "@/lib/errors";

const matchId = "cmvm2t1jj000623x893bp85tn";
const user = { id: "owner" };
const rating = { id: "rating-1", matchId, raterId: user.id };

function context(action: string) {
  return { params: Promise.resolve({ path: ["matches", matchId, action] }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.matchDetail.mockResolvedValue({ ownerId: user.id, requests: [] });
  mocks.findRatings.mockResolvedValue([rating]);
  mocks.rateMatch.mockResolvedValue(rating);
});

describe("match rating HTTP routes", () => {
  it.each(["rating", "ratings"])("GET /matches/:id/%s returns ratings for the owner", async (action) => {
    const response = await GET(new Request(`http://localhost/api/matches/${matchId}/${action}`), context(action));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [rating] });
    expect(mocks.findRatings).toHaveBeenCalledWith({ where: { matchId, hidden: false } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(mocks.rateMatch).not.toHaveBeenCalled();
  });

  it("allows the accepted opponent to read ratings", async () => {
    mocks.matchDetail.mockResolvedValue({ ownerId: "another-owner", requests: [{ userId: user.id, status: "ACCEPTED" }] });
    const response = await GET(new Request(`http://localhost/api/matches/${matchId}/rating`), context("rating"));
    expect(response.status).toBe(200);
  });

  it.each(["rating", "ratings"])("GET /matches/:id/%s requires login", async (action) => {
    mocks.requireUser.mockRejectedValue(new AppError(401, "UNAUTHORIZED", "Vui lòng đăng nhập để tiếp tục."));
    const response = await GET(new Request(`http://localhost/api/matches/${matchId}/${action}`), context(action));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(mocks.findRatings).not.toHaveBeenCalled();
  });

  it.each(["rating", "ratings"])("GET /matches/:id/%s rejects an unaccepted requester", async (action) => {
    mocks.matchDetail.mockResolvedValue({ ownerId: "another-owner", requests: [{ userId: user.id, status: "PENDING" }] });
    const response = await GET(new Request(`http://localhost/api/matches/${matchId}/${action}`), context(action));
    expect(response.status).toBe(403);
    expect(mocks.findRatings).not.toHaveBeenCalled();
  });

  it("POST /matches/:id/rating still submits the JSON body", async () => {
    const body = { happened: true, stars: 5 };
    const response = await POST(new Request(`http://localhost/api/matches/${matchId}/rating`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), context("rating"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rating);
    expect(mocks.requireUser).toHaveBeenCalledWith(true);
    expect(mocks.rateLimit).toHaveBeenCalledWith(`rating:${user.id}`, 10, 60);
    expect(mocks.rateMatch).toHaveBeenCalledWith(matchId, user.id, body);
  });
});
