/**
 * DEVELOPMENT / DEMO SEED DATA.
 * Everything created here is fake and tagged "demo" (products) or prefixed
 * "DEMO" (customers, campaigns). Do NOT run against production with real data.
 *
 *   npm run db:seed
 */
import { PrismaClient, type OrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, DEFAULT_ROLES, type RoleKey } from "../src/core/rbac.ts";
import { computeOrderProfit } from "../src/core/profit.ts";

const db = new PrismaClient();
const T = (taka: number) => Math.round(taka * 100);
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rand = rnd(42);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
const img = (n: string, i = 1) => `/demo/${n}-${i}.webp`;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  console.log("Seeding roles & permissions…");
  for (const [key, p] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, create: { key, group: p.group, label: p.label }, update: { group: p.group, label: p.label } });
  }
  const perms = await db.permission.findMany();
  for (const [key, r] of Object.entries(DEFAULT_ROLES) as [RoleKey, (typeof DEFAULT_ROLES)[RoleKey]][]) {
    const role = await db.role.upsert({ where: { key }, create: { key, name: r.name, isSystem: true }, update: { name: r.name } });
    const count = await db.rolePermission.count({ where: { roleId: role.id } });
    if (count === 0) {
      await db.rolePermission.createMany({ data: perms.filter((p) => (r.permissions as string[]).includes(p.key)).map((p) => ({ roleId: role.id, permissionId: p.id })) });
    }
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "change-me-on-first-login";
  const superRole = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const admin = await db.user.upsert({ where: { email }, create: { email, name: "Store Owner", passwordHash: await bcrypt.hash(password, 12), roleId: superRole.id }, update: {} });
  const mmRole = await db.role.findUniqueOrThrow({ where: { key: "MARKETING_MANAGER" } });
  await db.user.upsert({ where: { email: "marketing@example.com" }, create: { email: "marketing@example.com", name: "DEMO Marketing", passwordHash: await bcrypt.hash("marketing-demo-1", 12), roleId: mmRole.id }, update: {} });

  if ((await db.product.count()) > 0) {
    console.log("Catalog already present — skipping demo catalog/orders. (Roles & admin ensured.)");
    return;
  }

  console.log("Seeding settings, zones, content…");
  await db.setting.createMany({
    data: [
      { key: "store", value: { name: "Northwind BD", tagline: "Everyday essentials, beautifully made. Delivered across Bangladesh.", supportPhone: "09600-000000", supportEmail: "hello@example.com", whatsapp: "01700000000", address: "House 1, Road 1, Gulshan, Dhaka", returnPolicySummary: "7-day easy returns", warrantySummary: "Quality guaranteed", logoUrl: "", facebookUrl: "", instagramUrl: "" } },
      { key: "payment", value: { enabled: ["cod", "bkash", "sslcommerz", "bkash_manual", "nagad", "mock"], codMaxAmount: null, fees: { cod: { percent: 1, fixed: 0 }, sslcommerz: { percent: 2.5, fixed: 0 }, bkash: { percent: 1.85, fixed: 0 }, nagad: { percent: 1.5, fixed: 0 }, rocket: { percent: 1.8, fixed: 0 } }, manualMfsNumbers: { bkash: "01700000000", nagad: "01700000000", rocket: "" } } },
      { key: "seo", value: { defaultTitle: "Northwind BD — Shop Online in Bangladesh", titleTemplate: "%s | Northwind BD", defaultDescription: "Premium everyday essentials with fast delivery across Bangladesh. Cash on delivery available.", ogImage: "" } },
    ],
    skipDuplicates: true,
  });
  await db.shippingZone.createMany({
    data: [
      { key: "inside_dhaka", name: "Inside Dhaka", districts: ["Dhaka"], charge: T(70), courierCost: T(60), returnCost: T(30), minDays: 1, maxDays: 2, position: 0 },
      { key: "sub_dhaka", name: "Dhaka suburbs", districts: ["Gazipur", "Narayanganj", "Savar", "Keraniganj"], charge: T(100), courierCost: T(90), returnCost: T(45), minDays: 2, maxDays: 3, position: 1 },
      { key: "outside_dhaka", name: "Outside Dhaka", districts: [], charge: T(130), courierCost: T(110), returnCost: T(55), minDays: 2, maxDays: 5, position: 2 },
    ],
  });

  const catDefs = [
    ["Men", "men", null], ["Women", "women", null], ["Accessories", "accessories", null], ["Beauty", "beauty", null], ["Electronics", "electronics", null], ["Home", "home", null],
    ["T-Shirts", "men-t-shirts", "men"], ["Shirts", "men-shirts", "men"], ["Bags", "bags", "accessories"], ["Watches", "watches", "accessories"],
  ] as const;
  const cats: Record<string, string> = {};
  for (const [i, [name, slug, parent]] of catDefs.entries()) {
    const c = await db.category.create({ data: { name, slug, position: i, parentId: parent ? cats[parent] : null, imageUrl: parent ? null : `/demo/cat-${slug}.webp`, description: `Shop ${name.toLowerCase()} online — fast delivery across Bangladesh.` } });
    cats[slug] = c.id;
  }
  const brands: Record<string, string> = {};
  for (const b of ["Northwind", "Aarong Lane", "Kaya", "SoundBox"]) brands[b] = (await db.brand.create({ data: { name: b, slug: b.toLowerCase().replace(/\s+/g, "-") } })).id;

  console.log("Seeding products…");
  type PD = { name: string; key: string; cat: string; sub?: string; brand: string; price: number; sale?: number; cost: number; options?: Record<string, string[]>; stock: number; desc: string; attrs: [string, string][] };
  const defs: PD[] = [
    { name: "Premium Cotton T-Shirt", key: "cotton-tee", cat: "men", sub: "men-t-shirts", brand: "Northwind", price: 1200, sale: 990, cost: 420, options: { Size: ["S", "M", "L", "XL"], Color: ["Black", "White", "Navy"] }, stock: 12, desc: "<p>Our everyday tee in 180 GSM combed cotton. Soft, breathable and pre-shrunk so it keeps its shape.</p><ul><li>100% combed cotton</li><li>Regular fit</li><li>Machine wash cold</li></ul>", attrs: [["Material", "100% combed cotton"], ["Fabric weight", "180 GSM"], ["Fit", "Regular"], ["Origin", "Bangladesh"]] },
    { name: "Oxford Button-Down Shirt", key: "oxford-shirt", cat: "men", sub: "men-shirts", brand: "Northwind", price: 2450, cost: 980, options: { Size: ["M", "L", "XL"], Color: ["Sky", "White"] }, stock: 8, desc: "<p>A crisp Oxford weave shirt that works from office to weekend.</p>", attrs: [["Material", "Cotton Oxford"], ["Collar", "Button-down"]] },
    { name: "Classic Piqué Polo", key: "polo-shirt", cat: "men", sub: "men-t-shirts", brand: "Aarong Lane", price: 1650, sale: 1390, cost: 610, options: { Size: ["M", "L", "XL"] }, stock: 15, desc: "<p>Breathable piqué knit with a structured collar.</p>", attrs: [["Material", "Cotton piqué"]] },
    { name: "Everyday Canvas Tote", key: "canvas-tote", cat: "accessories", sub: "bags", brand: "Aarong Lane", price: 890, cost: 300, stock: 40, desc: "<p>Heavy canvas tote with inside pocket. Carries a laptop and lunch.</p>", attrs: [["Material", "12oz canvas"], ["Size", "40 × 38 × 12 cm"]] },
    { name: "Leather Sling Bag", key: "leather-bag", cat: "accessories", sub: "bags", brand: "Northwind", price: 3950, sale: 3450, cost: 1650, options: { Color: ["Tan", "Black"] }, stock: 4, desc: "<p>Full-grain leather sling with adjustable strap.</p>", attrs: [["Material", "Full-grain leather"]] },
    { name: "Minimal Analog Watch", key: "minimal-watch", cat: "accessories", sub: "watches", brand: "Northwind", price: 4500, cost: 1900, options: { Strap: ["Leather", "Mesh"] }, stock: 9, desc: "<p>Clean dial, sapphire-coated glass and Japanese quartz movement.</p>", attrs: [["Movement", "Japanese quartz"], ["Water resistance", "3 ATM"], ["Case", "40 mm stainless steel"]] },
    { name: "Runner Knit Sneaker", key: "runner-sneaker", cat: "men", brand: "Northwind", price: 3200, sale: 2790, cost: 1350, options: { Size: ["40", "41", "42", "43", "44"] }, stock: 6, desc: "<p>Lightweight knit upper with cushioned sole for all-day comfort.</p>", attrs: [["Upper", "Knit"], ["Sole", "EVA"]] },
    { name: "Vitamin C Brightening Serum", key: "vitamin-serum", cat: "beauty", brand: "Kaya", price: 1450, cost: 520, stock: 30, desc: "<p>15% vitamin C serum for brighter, even-toned skin.</p>", attrs: [["Volume", "30 ml"], ["Skin type", "All"]] },
    { name: "Nourishing Beard Oil", key: "beard-oil", cat: "beauty", brand: "Kaya", price: 750, cost: 230, stock: 3, desc: "<p>Argan and jojoba blend that softens and tames.</p>", attrs: [["Volume", "30 ml"]] },
    { name: "Wireless Over-Ear Headphones", key: "wireless-headphone", cat: "electronics", brand: "SoundBox", price: 5800, sale: 4990, cost: 2900, options: { Color: ["Black", "Sand"] }, stock: 7, desc: "<p>40-hour battery, active noise cancelling and fast charge.</p>", attrs: [["Battery", "40 hours"], ["Bluetooth", "5.3"], ["Warranty", "6 months"]] },
    { name: "Earbuds Pro", key: "earbud-pro", cat: "electronics", brand: "SoundBox", price: 2990, cost: 1450, stock: 18, desc: "<p>True wireless earbuds with ENC mic and IPX5.</p>", attrs: [["Battery", "6h + 24h case"], ["Water resistance", "IPX5"]] },
    { name: "Hand-glazed Ceramic Mug", key: "ceramic-mug", cat: "home", brand: "Aarong Lane", price: 650, cost: 210, options: { Color: ["Clay", "Sea", "Bone"] }, stock: 25, desc: "<p>Hand-glazed stoneware, 350 ml. Every piece is slightly unique.</p>", attrs: [["Capacity", "350 ml"], ["Dishwasher safe", "Yes"]] },
  ];

  const products: { id: string; name: string; variants: { id: string; price: number; cost: number; title: string; sku: string }[] }[] = [];
  for (const [i, d] of defs.entries()) {
    const sku = `NW-${String(i + 1).padStart(3, "0")}`;
    const names = Object.keys(d.options ?? {});
    let combos: Record<string, string>[] = [{}];
    for (const n of names) combos = combos.flatMap((c) => d.options![n]!.map((v) => ({ ...c, [n]: v })));
    const p = await db.product.create({
      data: {
        sku, name: d.name, slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        shortDescription: d.desc.replace(/<[^>]+>/g, " ").trim().split(".")[0] + ".",
        description: d.desc, categoryId: cats[d.cat], subcategoryId: d.sub ? cats[d.sub] : null, brandId: brands[d.brand],
        tags: ["demo", d.cat], regularPrice: T(d.price), salePrice: d.sale ? T(d.sale) : null, costPrice: T(d.cost), lowStockThreshold: 5,
        weightGrams: 400, optionNames: names, status: "ACTIVE", isFeatured: i % 3 === 0, publishedAt: new Date(Date.now() - (defs.length - i) * 86_400_000),
        seoTitle: `${d.name} — Buy Online in Bangladesh`, seoDescription: `${d.name} with fast delivery across Bangladesh. Cash on delivery available.`,
        images: { create: [{ url: img(d.key, 1), alt: d.name, width: 900, height: 1125, position: 0 }, { url: img(d.key, 2), alt: `${d.name} alternate view`, width: 900, height: 1125, position: 1 }] },
        attributes: { create: d.attrs.map(([name, value], position) => ({ name, value, position })) },
        variants: { create: combos.map((o, position) => ({ sku: names.length ? `${sku}-${Object.values(o).join("-").toUpperCase()}` : `${sku}-DEFAULT`, title: names.length ? Object.values(o).join(" / ") : "Default", options: o, stock: Math.max(0, d.stock - (position % 4)), isDefault: position === 0, position })) },
      },
      include: { variants: true },
    });
    products.push({ id: p.id, name: p.name, variants: p.variants.map((v) => ({ id: v.id, price: d.sale ? T(d.sale) : T(d.price), cost: T(d.cost), title: v.title, sku: v.sku })) });
  }

  console.log("Seeding coupons, homepage, pages, FAQ…");
  await db.coupon.createMany({
    data: [
      { code: "WELCOME10", type: "PERCENTAGE", value: 10, maxDiscount: T(300), firstOrderOnly: true, description: "10% off your first order" },
      { code: "SAVE200", type: "FIXED", value: T(200), minOrder: T(2000), description: "৳200 off orders over ৳2,000" },
      { code: "EID25", type: "PERCENTAGE", value: 25, maxDiscount: T(1000), minOrder: T(1500), usageLimit: 500, expiresAt: new Date(Date.now() + 60 * 86_400_000), description: "Eid special" },
      { code: "FREESHIP", type: "FREE_SHIPPING", value: 0, minOrder: T(1000), description: "Free delivery" },
    ],
  });
  await db.homepageSection.createMany({
    data: [
      { type: "announcement", title: "Free delivery on orders over ৳3,000 · Cash on delivery all over Bangladesh", position: 0, config: { link: "/products" } },
      { type: "hero", title: "Hero", position: 1, config: { slides: [{ image: "/demo/hero-desktop.webp", mobileImage: "/demo/hero-mobile.webp", heading: "Made for everyday. Built to last.", subheading: "New season essentials — delivered in 1–3 days.", ctaLabel: "Shop new arrivals", ctaHref: "/products?sort=newest" }] } },
      { type: "categories", title: "Shop by category", position: 2, config: {} },
      { type: "flash_sale", title: "Flash Sale", subtitle: "Limited stock at these prices", position: 3, config: { endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), limit: 8 } },
      { type: "best_sellers", title: "Best Sellers", position: 4, config: { limit: 10 } },
      { type: "new_arrivals", title: "New Arrivals", position: 5, config: { limit: 10 } },
      { type: "promo", title: "The Eid Edit", subtitle: "Up to 25% off with code EID25.", position: 6, config: { image: "/demo/promo.webp", ctaLabel: "Shop the edit", ctaHref: "/category/men" } },
      { type: "trending", title: "Trending now", position: 7, config: { limit: 10 } },
      { type: "recommended", title: "Recommended for you", position: 8, config: {} },
      { type: "reviews", title: "What customers say", position: 9, config: {} },
      { type: "faq", title: "Questions? Answered.", position: 10, config: { group: "general" } },
      { type: "newsletter", title: "Get first access to drops", subtitle: "Offers and new arrivals, twice a month. No spam.", position: 11, config: {} },
    ],
  });
  const policy = (t: string) => `<p>${t}</p><h2>Need help?</h2><p>Call us or message us on WhatsApp — we reply within working hours (10am–8pm, Sat–Thu).</p>`;
  await db.page.createMany({
    data: [
      { slug: "about", title: "About us", content: policy("We make everyday essentials that last — designed and sourced in Bangladesh.") },
      { slug: "contact", title: "Contact", content: '<p>Phone: 09600-000000</p><p>Email: <a href="mailto:hello@example.com">hello@example.com</a></p><p>Address: House 1, Road 1, Gulshan, Dhaka</p>' },
      { slug: "privacy-policy", title: "Privacy policy", content: policy("We collect only what we need to deliver your order (name, phone, address). We never sell your data. Payment details are handled by our payment partners and never stored on our servers.") },
      { slug: "terms", title: "Terms & conditions", content: policy("By placing an order you agree to these terms. Prices are in BDT and include VAT where applicable.") },
      { slug: "return-policy", title: "Return policy", content: policy("Unused items in original packaging can be returned within 7 days of delivery. Refunds are issued to the original payment method or bKash within 5 working days.") },
      { slug: "shipping-policy", title: "Shipping policy", content: policy("Inside Dhaka: 1–2 days (৳70). Outside Dhaka: 2–5 days (৳130). Free delivery on orders over ৳3,000.") },
    ],
  });
  await db.faq.createMany({
    data: [
      { question: "How long does delivery take?", answer: "Inside Dhaka 1–2 days, outside Dhaka 2–5 days.", position: 0 },
      { question: "Can I pay cash on delivery?", answer: "Yes — COD is available all over Bangladesh. You can also pay by bKash, Nagad or card.", position: 1 },
      { question: "What is your return policy?", answer: "Unused items can be returned within 7 days of delivery.", position: 2 },
      { question: "How do I track my order?", answer: "Use the Track Order page with your order number and phone number.", position: 3 },
    ],
  });

  console.log("Seeding campaigns, customers, orders, events…");
  const campaigns = [
    await db.campaign.create({ data: { name: "DEMO Summer Sale", utmCampaign: "summer_sale", platform: "facebook", budget: T(150000) } }),
    await db.campaign.create({ data: { name: "DEMO Retargeting", utmCampaign: "retargeting", platform: "facebook", budget: T(40000) } }),
    await db.campaign.create({ data: { name: "DEMO Google Search", utmCampaign: "brand_search", platform: "google", budget: T(30000) } }),
  ];
  const today = new Date(new Date().toISOString().slice(0, 10));
  for (let d = 0; d < 30; d++) {
    const date = new Date(today.getTime() - d * 86_400_000);
    for (const c of campaigns) await db.adSpend.create({ data: { campaignId: c.id, date, amount: T(c.utmCampaign === "summer_sale" ? 3500 + rand() * 1500 : c.utmCampaign === "retargeting" ? 900 + rand() * 400 : 600 + rand() * 300), clicks: Math.floor(200 + rand() * 300), impressions: Math.floor(10000 + rand() * 8000) } });
    if (d % 7 === 0) await db.expense.create({ data: { category: pick(["packaging", "software", "photography"]), amount: T(2000 + rand() * 3000), date, note: "DEMO expense" } });
  }
  await db.expense.create({ data: { category: "rent", amount: T(35000), date: new Date(today.getFullYear(), today.getMonth(), 1), note: "DEMO office rent" } });
  await db.expense.create({ data: { category: "salary", amount: T(90000), date: new Date(today.getFullYear(), today.getMonth(), 1), note: "DEMO salaries" } });

  const first = ["Rahim", "Karim", "Nusrat", "Farhana", "Tanvir", "Sadia", "Arif", "Mitu", "Rakib", "Sumaiya", "Imran", "Jannat"];
  const last = ["Ahmed", "Hossain", "Islam", "Rahman", "Chowdhury", "Khan"];
  const districts = ["Dhaka", "Dhaka", "Dhaka", "Gazipur", "Chattogram", "Sylhet", "Khulna", "Rajshahi"];
  const customers = [];
  for (let i = 0; i < 40; i++) {
    const phone = `01${pick(["7", "8", "9", "6", "5"])}${String(10000000 + Math.floor(rand() * 89999999)).slice(0, 8)}`;
    customers.push(await db.customer.upsert({ where: { phone }, create: { phone, name: `DEMO ${pick(first)} ${pick(last)}`, email: i % 3 === 0 ? `demo${i}@example.com` : null, createdAt: new Date(Date.now() - rand() * 60 * 86_400_000) }, update: {} }));
  }
  const zones = await db.shippingZone.findMany();
  const sources = [
    { channel: "facebook_ads", utmSource: "facebook", utmMedium: "paid", utmCampaign: "summer_sale" },
    { channel: "facebook_ads", utmSource: "facebook", utmMedium: "paid", utmCampaign: "retargeting" },
    { channel: "google_ads", utmSource: "google", utmMedium: "cpc", utmCampaign: "brand_search" },
    { channel: "organic_search" },
    { channel: "direct" },
    { channel: "organic_social" },
  ];
  const statuses: OrderStatus[] = ["DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED", "SHIPPED", "CONFIRMED", "PENDING", "CANCELLED", "RETURNED"];

  for (let i = 0; i < 160; i++) {
    const c = pick(customers);
    const createdAt = new Date(Date.now() - Math.pow(rand(), 1.4) * 30 * 86_400_000);
    const lines = Array.from({ length: 1 + Math.floor(rand() * 2.2) }, () => { const p = pick(products); const v = pick(p.variants); return { p, v, qty: 1 + Math.floor(rand() * 1.6) }; });
    const subtotal = lines.reduce((s, l) => s + l.v.price * l.qty, 0);
    const district = pick(districts);
    const zone = zones.find((z) => z.districts.includes(district)) ?? zones.find((z) => z.districts.length === 0)!;
    const shippingFee = subtotal >= T(3000) ? 0 : zone.charge;
    const discount = rand() < 0.15 ? Math.min(T(200), subtotal) : 0;
    const status = pick(statuses);
    const src = pick(sources);
    const total = subtotal - discount + shippingFee;
    const order = await db.order.create({
      data: {
        customerId: c.id, shipName: c.name!, shipPhone: c.phone, shipDistrict: district, shipArea: "DEMO Area", shipAddress: `DEMO House ${i}, Road ${i % 20}`,
        deliveryMethod: zone.key, subtotal, discount, shippingFee, total, paymentMethod: rand() < 0.8 ? "cod" : "bkash", paymentStatus: status === "DELIVERED" ? "PAID" : "UNPAID",
        status, riskScore: status === "CANCELLED" ? 35 : 5, riskLevel: status === "CANCELLED" && rand() < 0.5 ? "MEDIUM" : "LOW", source: src.utmCampaign ? `${src.channel} → ${src.utmCampaign}` : src.channel,
        deliveryCost: zone.courierCost, gatewayFee: Math.round(total * 0.01), createdAt, deliveredAt: status === "DELIVERED" ? new Date(createdAt.getTime() + 2 * 86_400_000) : null,
        purchaseTrackedAt: createdAt, metaEventId: `purchase.demo-${i}`,
        items: { create: lines.map((l) => ({ productId: l.p.id, variantId: l.v.id, name: l.p.name, variantTitle: l.v.title, sku: l.v.sku, unitPrice: l.v.price, unitCost: l.v.cost, quantity: l.qty, lineTotal: l.v.price * l.qty })) },
        history: { create: [{ to: "PENDING", note: "DEMO order placed", createdAt }, ...(status !== "PENDING" ? [{ from: "PENDING" as OrderStatus, to: status, createdAt: new Date(createdAt.getTime() + 86_400_000) }] : [])] },
        attribution: { create: { channel: src.channel, utmSource: src.utmSource, utmMedium: src.utmMedium, utmCampaign: src.utmCampaign, landingPage: "/products/premium-cotton-t-shirt", createdAt } },
      },
      include: { items: true },
    });
    if (["DELIVERED", "RETURNED", "CANCELLED"].includes(status)) {
      const p = computeOrderProfit({ status, subtotal, discount, shippingFee, deliveryCost: zone.courierCost, gatewayFee: order.gatewayFee, returnCost: zone.returnCost, items: order.items.map((it) => ({ unitCost: it.unitCost, quantity: it.quantity, restocked: true })), paymentMethod: order.paymentMethod });
      await db.profitRecord.create({ data: { orderId: order.id, date: new Date(createdAt.toISOString().slice(0, 10)), ...p, campaign: src.utmCampaign ?? null } });
      if (status === "DELIVERED") for (const it of order.items) await db.product.update({ where: { id: it.productId }, data: { soldCount: { increment: it.quantity } } });
    }
    // Funnel events for this order's journey (plus some non-converting visitors)
    const vid = `demo-visitor-${i}`;
    const base = { visitorId: vid, utmSource: src.utmSource, utmCampaign: src.utmCampaign, channel: src.channel };
    await db.marketingEvent.createMany({
      data: [
        { ...base, name: "page_view", eventId: `pv-${i}`, createdAt },
        { ...base, name: "view_item", eventId: `vi-${i}`, productId: lines[0]!.p.id, createdAt },
        { ...base, name: "add_to_cart", eventId: `atc-${i}`, productId: lines[0]!.p.id, createdAt },
        { ...base, name: "begin_checkout", eventId: `bc-${i}`, createdAt },
        { ...base, name: "purchase", eventId: `pur-${i}`, orderId: order.id, value: total, createdAt },
      ],
    });
  }
  const extra = [];
  for (let k = 0; k < 2500; k++) {
    const src = pick(sources);
    const createdAt = new Date(Date.now() - rand() * 30 * 86_400_000);
    const vid = `demo-browser-${k}`;
    const p = pick(products);
    extra.push({ name: "page_view", eventId: `xpv-${k}`, visitorId: vid, utmSource: src.utmSource, utmCampaign: src.utmCampaign, channel: src.channel, createdAt });
    if (rand() < 0.6) extra.push({ name: "view_item", eventId: `xvi-${k}`, visitorId: vid, productId: p.id, utmSource: src.utmSource, utmCampaign: src.utmCampaign, channel: src.channel, createdAt });
    if (rand() < 0.12) extra.push({ name: "add_to_cart", eventId: `xatc-${k}`, visitorId: vid, productId: p.id, utmSource: src.utmSource, utmCampaign: src.utmCampaign, channel: src.channel, createdAt });
  }
  await db.marketingEvent.createMany({ data: extra });

  console.log("Seeding reviews…");
  const reviewTexts = ["Great quality, fits perfectly. Delivered next day in Dhaka.", "Exactly as pictured. Will order again.", "Good product for the price. Packaging was neat.", "Fabric feels premium. Highly recommended!", "Battery life is excellent. Very happy."];
  for (const p of products.slice(0, 8)) {
    const n = 2 + Math.floor(rand() * 4);
    const ratings: number[] = [];
    for (let k = 0; k < n; k++) {
      const rating = rand() < 0.75 ? 5 : 4;
      ratings.push(rating);
      await db.review.create({ data: { productId: p.id, authorName: `${pick(first)} ${pick(last)[0]}.`, rating, body: pick(reviewTexts), status: "APPROVED", verifiedPurchase: rand() < 0.7 } });
    }
    await db.product.update({ where: { id: p.id }, data: { ratingAvg: ratings.reduce((a, b) => a + b, 0) / ratings.length, ratingCount: ratings.length } });
  }
  await db.review.create({ data: { productId: products[0]!.id, authorName: "DEMO pending", rating: 3, body: "Size runs slightly large. Waiting for moderation.", status: "PENDING" } });

  console.log(`\n✔ Demo data ready.\n  Admin: ${email} / ${password === "change-me-on-first-login" ? password + "  ← CHANGE THIS" : "(from SEED_ADMIN_PASSWORD)"}\n  Marketing manager (role demo): marketing@example.com / marketing-demo-1\n  Coupons: WELCOME10, SAVE200, EID25, FREESHIP\n`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
