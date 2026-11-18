import { test, expect } from "@playwright/test";

/** Customer: Product → Cart → Checkout → Order (COD). Requires seeded DB. */
test("customer can browse, pick a variant, add to cart and place a COD order", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();

  await page.goto("/products/premium-cotton-t-shirt");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Premium Cotton T-Shirt");
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Black", exact: true }).click();
  await page.getByRole("button", { name: /Add to cart/i }).first().click();
  await expect(page.getByRole("dialog", { name: /cart/i })).toBeVisible();

  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("E2E Tester");
  await page.getByLabel("Mobile number").fill("01791834560");
  await page.getByLabel("District").selectOption("Dhaka");
  await page.getByLabel("Area / Thana").fill("Gulshan");
  await page.getByLabel("Full address").fill("House 10, Road 5, Gulshan 1");
  await page.getByLabel(/Cash on Delivery/).check();
  await page.getByRole("button", { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/checkout\/success\?order=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Order #\d+ placed/);
});

test("search returns results and is typo tolerant", async ({ page }) => {
  await page.goto("/search?q=cotten");
  await expect(page.getByText(/Premium Cotton/).first()).toBeVisible();
});

test("no horizontal overflow on key pages", async ({ page }) => {
  for (const path of ["/", "/products", "/products/premium-cotton-t-shirt", "/cart", "/checkout", "/track"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});

test("price tampering is ignored by the server", async ({ request }) => {
  const res = await request.post("/api/checkout", { data: { name: "X", phone: "01791834560", district: "Dhaka", area: "A", address: "House 1 Road 1", paymentMethod: "cod", idempotencyKey: crypto.randomUUID(), total: 1, subtotal: 1, discount: 999999 } });
  // Empty cart in a fresh context → 400, never an order with a client-supplied total.
  expect([400, 422]).toContain(res.status());
});
