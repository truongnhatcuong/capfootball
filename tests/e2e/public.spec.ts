import { test, expect } from "@playwright/test";
test("region selection persists and empty feed remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Tìm tỉnh thành" }).fill("Hồ Chí Minh");
  await dialog.getByRole("button", { name: "Thành phố Hồ Chí Minh" }).click();
  await expect(page.getByRole("heading", { name: "Kèo đang tìm đối", exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Hồ Chí Minh", exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("anonymous visitors cannot create matches and private APIs return JSON 401", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("capfootball-region", JSON.stringify({ state: { provinceCode: "79", provinceName: "Thành phố Hồ Chí Minh" }, version: 1 })));
  await page.goto("/matches/new");
  await expect(page.getByRole("link", { name: "Đăng nhập với Google" })).toBeVisible();
  const response = await request.post("/api/matches", { data: {} });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
});
test("privacy and deletion pages are publicly accessible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("capfootball-region", JSON.stringify({ state: { provinceCode: "79", provinceName: "Thành phố Hồ Chí Minh" }, version: 1 })));
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Chính sách quyền riêng tư", exact: true })).toBeVisible();
  await page.goto("/data-deletion");
  await expect(page.getByRole("heading", { name: "Xóa tài khoản & dữ liệu" })).toBeVisible();
});
