import { expect, test } from "@playwright/test";

const readyReport = {
  schemaVersion: 1,
  service: "api",
  version: "0.1.0",
  status: "ok",
  checks: { postgres: { status: "ok", latencyMs: 1 }, redis: { status: "ok", latencyMs: 1 } },
};

test("shell renders, reports a ready API and boots the Phaser renderer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/health/ready", (route) => route.fulfill({ json: readyReport }));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Civilization: Living History" })).toBeVisible();
  await expect(page.getByTestId("api-status")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("api-status")).toHaveText("API ready (v0.1.0)");

  const map = page.getByTestId("map-canvas");
  await expect(map).toHaveAttribute("data-renderer-ready", "true", { timeout: 15_000 });
  await expect(map.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("shell reports degraded and unreachable API states", async ({ page }) => {
  await page.route("**/api/health/ready", (route) =>
    route.fulfill({
      status: 503,
      json: { ...readyReport, status: "down", checks: { postgres: { status: "down", latencyMs: 2, error: "x" } } },
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("api-status")).toHaveText("API degraded: postgres down");

  await page.unroute("**/api/health/ready");
  await page.route("**/api/health/ready", (route) => route.abort("connectionrefused"));
  await page.reload();
  await expect(page.getByTestId("api-status")).toHaveAttribute("data-state", "unreachable");
});
