import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSchema, ratingSchema, messageSchema, venueSchema, profileSchema, donateSchema } from "../../src/schemas";
import { skillRange } from "../../src/constants/skill";
import { pageResult, cursorWhere, decodeCursor } from "../../src/lib/pagination";
import { publicUser } from "../../src/lib/public-user";
import { dateLabel, timeLabel, money } from "../../src/lib/client";
import provinces from "../../src/data/provinces.json";
import { Prisma } from "@prisma/client";
import { errorResponse } from "../../src/lib/errors";
import { logger } from "../../src/lib/logger";
import { toast, useToastStore } from "../../src/stores/toast.store";
import { vietQrImageUrl } from "../../src/lib/vietqr";
import { listVietQrBanks } from "../../src/services/banks";

test("VietQR needs only a bank and account number, preserving leading zeroes", () => {
  const config = { enabled: true, message: "Ủng hộ sân chơi", bankBin: "970422", accountNo: "0012345678" };
  const parsed = donateSchema.parse(config);
  assert.equal(parsed.accountName, null);
  const qr = new URL(vietQrImageUrl(parsed.bankBin, parsed.accountNo)!);
  assert.equal(qr.pathname, "/image/970422-0012345678-compact2.png");
  assert.equal(qr.searchParams.has("accountName"), false);
  assert.equal(qr.searchParams.has("amount"), false);
  assert.equal(donateSchema.safeParse({ ...config, accountNo: null }).success, false);
  assert.equal(donateSchema.safeParse({ ...config, bankBin: null }).success, false);
  assert.equal(donateSchema.safeParse({ ...config, bankBin: null, accountNo: null }).success, false);
  assert.equal(donateSchema.safeParse({ ...config, enabled: false, bankBin: null, accountNo: null }).success, true);
  assert.equal(donateSchema.safeParse({ ...config, bankBin: null, accountNo: null, paypalUrl: "https://paypal.me/example" }).success, true);
  assert.equal(vietQrImageUrl("970422", "12/../34"), null);
  assert.equal(vietQrImageUrl("bad", "0012345678"), null);
});

test("bank choices include only transfer-supported banks and discard duplicate BINs", async (t) => {
  const bank = { bin: "970422", shortName: "MBBank", name: "Ngân hàng Quân đội", transferSupported: 1 };
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ code: "00", data: [bank, bank, { ...bank, bin: "970436", transferSupported: 0 }] }));
  assert.deepEqual(await listVietQrBanks(), { data: [{ bin: "970422", shortName: "MBBank", name: "Ngân hàng Quân đội" }] });
  assert.equal(fetch.mock.calls[0].arguments[0], "https://api.vietqr.io/v2/banks");
});

test("bank catalog errors produce a retryable error rather than incomplete choices", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "99", data: [] }));
  await assert.rejects(listVietQrBanks(), { code: "BANKS_UNAVAILABLE", status: 502 });
});

test("toast notifications replace duplicates, keep three recent messages and dismiss individually", (t) => {
  toast.dismiss();
  t.after(() => toast.dismiss());
  toast.success("Đã lưu hồ sơ.");
  toast.error("Chưa lưu được.");
  const repeated = toast.success("Đã lưu hồ sơ.");
  assert.deepEqual(useToastStore.getState().items.map((item) => item.message), ["Chưa lưu được.", "Đã lưu hồ sơ."]);
  toast.info("Đã đổi khu vực.");
  toast.success("Đã gửi báo cáo.");
  assert.equal(useToastStore.getState().items.length, 3);
  assert.equal(useToastStore.getState().items.some((item) => item.message === "Chưa lưu được."), false);
  toast.dismiss(repeated);
  assert.equal(useToastStore.getState().items.some((item) => item.id === repeated), false);
  toast.dismiss();
  assert.equal(useToastStore.getState().items.length, 0);
});

test("missing database tables and columns return 503 and log Prisma codes without raw error details", async (t) => {
  const log = t.mock.method(logger, "error", () => undefined);
  for (const code of ["P2021", "P2022"]) {
    const error = new Prisma.PrismaClientKnownRequestError("private database details", { code, clientVersion: "6.19.3", meta: { modelName: "Province" } });
    const response = errorResponse(error, "database-test");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "DATABASE_SCHEMA_NOT_READY");
    const entry = log.mock.calls.at(-1)!.arguments[0];
    assert.deepEqual(entry, { requestId: "database-test", errorType: "PrismaClientKnownRequestError", prismaCode: code, model: "Province" });
    assert.equal(JSON.stringify(entry).includes("private database details"), false);
  }
});

const validMatch = () => ({ title: "Tìm đội giao hữu", skill: "AVERAGE", format: "SEVEN", kickoffAt: new Date(Date.now() + 86400000).toISOString(), provinceCode: "79", venue: "Sân giao hữu", fee: 600000 });
test("match validation rejects past kickoffs, negative fees and inverted skill ranges", () => {
  assert.equal(matchSchema.safeParse(validMatch()).success, true);
  for (const patch of [{ kickoffAt: "2020-01-01T00:00:00Z" }, { fee: -1 }, { skill: "GOOD", skillMax: "WEAK" }, { venue: "" }, { provinceCode: "790" }]) assert.equal(matchSchema.safeParse({ ...validMatch(), ...patch }).success, false);
});
test("skill ranges contain every intermediate level", () => {
  assert.deepEqual(skillRange("AVERAGE", "GOOD"), ["AVERAGE", "ABOVE_AVG", "GOOD"]);
  assert.equal(skillRange().length, 6);
});
test("ratings distinguish played matches, mutual cancellation and no-shows", () => {
  assert.equal(ratingSchema.safeParse({ happened: true, stars: 5 }).success, true);
  assert.equal(ratingSchema.safeParse({ happened: false, noShow: false }).success, true);
  assert.equal(ratingSchema.safeParse({ happened: false, noShow: true, comment: "Đối thủ không đến đúng giờ" }).success, true);
  for (const data of [{ happened: true }, { happened: true, stars: 6 }, { happened: true, stars: 5, noShow: true }, { happened: false, stars: 3 }, { happened: false, noShow: true, comment: "vắng" }]) assert.equal(ratingSchema.safeParse(data).success, false);
});
test("messages reject whitespace-only and oversized content", () => {
  assert.equal(messageSchema.safeParse({ body: "   " }).success, false);
  assert.equal(messageSchema.safeParse({ body: "a".repeat(1001) }).success, false);
  assert.equal(messageSchema.parse({ body: " Chào đội bạn! " }).body, "Chào đội bạn!");
});
test("venue coordinates must be a complete pair and in bounds", () => {
  const venue = { name: "Sân giao hữu", address: "Đường bóng đá", provinceCode: "79", formats: ["SEVEN"] };
  assert.equal(venueSchema.safeParse(venue).success, true);
  assert.equal(venueSchema.safeParse({ ...venue, lat: 10.8 }).success, false);
  assert.equal(venueSchema.safeParse({ ...venue, lat: 91, lng: 106 }).success, false);
  assert.equal(venueSchema.safeParse({ ...venue, lat: 10.8, lng: 106.7 }).success, true);
});
test("profile validation never grants consent from arbitrary truthy values", () => {
  assert.equal(profileSchema.safeParse({ acceptTerms: "yes" }).success, false);
  assert.equal(profileSchema.safeParse({ acceptTerms: true, zaloPhone: "0912345678", zaloConsent: true }).success, true);
  assert.equal(profileSchema.safeParse({ zaloPhone: "+123456" }).success, false);
});
test("cursor pagination preserves ordering ties and does not expose the lookahead row", () => {
  const createdAt = new Date("2026-10-23T10:00:00Z");
  const page = pageResult([{ id: "c", createdAt }, { id: "b", createdAt }, { id: "a", createdAt }], 2);
  assert.deepEqual(page.data.map((r) => r.id), ["c", "b"]);
  assert.equal(decodeCursor(page.nextCursor!)?.id, "b");
  assert.deepEqual(cursorWhere(page.nextCursor!), { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: "b" } }] });
  assert.equal(pageResult([{ id: "c", createdAt }], 2).nextCursor, null);
  assert.throws(() => decodeCursor("not-valid-json"));
});
test("public reputation is withheld until three ratings", () => {
  assert.equal(publicUser({ ratingAvg: 5, ratingCount: 2 }).ratingAvg, null);
  assert.equal(publicUser({ ratingAvg: 4.5, ratingCount: 3 }).ratingAvg, 4.5);
});
test("Vietnam time and fee formatting are independent of browser timezone", () => {
  assert.equal(timeLabel("2026-10-23T12:30:00Z"), "19:30");
  assert.match(dateLabel("2026-10-23T20:00:00Z"), /24\/10/);
  assert.equal(money(null), "Thỏa thuận"); assert.equal(money(0), "Miễn phí");
});
test("bundled province catalog contains 34 unique stable two-digit codes", () => {
  assert.equal(provinces.length, 34); assert.equal(new Set(provinces.map((p) => p.code)).size, 34);
  assert.equal(new Set(provinces.map((p) => p.slug)).size, 34);
  for (const p of provinces) assert.match(p.code, /^\d{2}$/);
});
