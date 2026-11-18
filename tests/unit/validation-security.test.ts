import { describe, expect, it } from "vitest";
import { checkoutSchema, productInputSchema, couponInputSchema } from "@/validation";
import { _redactForTests } from "@/server/logger";
import { can, DEFAULT_ROLES, ADMIN_NAV } from "@/core/rbac";

describe("checkout validation", () => {
  const base = { name: "Mobin", phone: "+8801712345679", district: "Dhaka", area: "Gulshan", address: "House 1, Road 2", paymentMethod: "cod", idempotencyKey: crypto.randomUUID() };
  it("normalises phone and strips unknown (price) fields", () => {
    const r = checkoutSchema.parse({ ...base, total: 1, discount: 99999 });
    expect(r.phone).toBe("01712345679");
    expect("total" in r).toBe(false);
    expect("discount" in r).toBe(false);
  });
  it("rejects invalid district and phone", () => {
    expect(checkoutSchema.safeParse({ ...base, district: "Atlantis" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });
});

describe("product input", () => {
  const p = { name: "Tee", sku: "T1", regularPrice: "1200", salePrice: "990", status: "ACTIVE", variants: [{ sku: "T1-M", title: "M", price: "", stock: "5" }] };
  it("converts taka to poisha", () => {
    const r = productInputSchema.parse(p);
    expect(r.regularPrice).toBe(120000);
    expect(r.salePrice).toBe(99000);
    expect(r.variants[0]!.price).toBeNull();
  });
  it("sale price must be below regular", () => {
    expect(productInputSchema.safeParse({ ...p, salePrice: "1500" }).success).toBe(false);
  });
});

describe("coupon input", () => {
  it("FIXED is stored in poisha, PERCENTAGE as percent", () => {
    expect(couponInputSchema.parse({ code: "save200", type: "FIXED", value: "200", usageLimit: "", perCustomerLimit: "" }).value).toBe(20000);
    expect(couponInputSchema.parse({ code: "EID25", type: "PERCENTAGE", value: "25", usageLimit: "", perCustomerLimit: "" }).value).toBe(25);
    expect(couponInputSchema.safeParse({ code: "BAD", type: "PERCENTAGE", value: "150", usageLimit: "", perCustomerLimit: "" }).success).toBe(false);
  });
});

describe("logging never contains secrets", () => {
  it("redacts token/password/cookie keys deeply", () => {
    const out = JSON.stringify(_redactForTests({ access_token: "EAAG", nested: { password: "p", Authorization: "Bearer x", ok: 1 }, list: [{ apiKey: "k" }] }));
    expect(out).not.toMatch(/EAAG|Bearer x|"p"|"k"/);
    expect(out).toContain('"ok":1');
  });
});

describe("permissions", () => {
  it("every admin nav entry is gated and support agents cannot see finance", () => {
    const agent = { roleKey: "SUPPORT_AGENT", permissions: DEFAULT_ROLES.SUPPORT_AGENT.permissions };
    const visible = ADMIN_NAV.filter((n) => can(agent, n.permission)).map((n) => n.href);
    expect(visible).not.toContain("/admin/profit");
    expect(visible).not.toContain("/admin/settings");
    expect(visible).toContain("/admin/orders");
  });
});
