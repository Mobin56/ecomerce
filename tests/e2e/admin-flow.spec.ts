import { test, expect } from "@playwright/test";

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "change-me-on-first-login";

/** Admin: Login → Product → Order → Inventory */
test("admin can log in, view a product, update an order and see inventory", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Premium Cotton T-Shirt" }).first().click();
  await expect(page.getByRole("heading", { name: "Premium Cotton T-Shirt" })).toBeVisible();

  await page.goto("/admin/orders?status=PENDING");
  const first = page.locator("tbody tr a").first();
  if (await first.count()) {
    await first.click();
    await page.getByLabel("Move to").selectOption("CONFIRMED");
    await page.getByRole("button", { name: "Update" }).click();
    await expect(page.getByText("Status updated")).toBeVisible();
  }

  await page.goto("/admin/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
});

test("marketing manager cannot open admin users", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("marketing@example.com");
  await page.getByLabel("Password").fill("marketing-demo-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
  await page.goto("/admin/marketing/campaigns");
  await expect(page.getByRole("heading", { name: "Campaign analytics" })).toBeVisible();
});
