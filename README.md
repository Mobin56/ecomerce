# eCommerce Platform (Bangladesh)

A production-oriented eCommerce **system**: storefront, admin panel, orders, inventory, CRM, payments (COD / bKash / SSLCommerz / Nagad / Rocket), courier integrations (Steadfast / Pathao / RedX), Meta Pixel + Conversions API, GA4, UTM attribution, true-profit reporting, abandoned-cart recovery, a risk engine and AI tools.

> **Status:** code complete for every requirement in the brief. It was written in a sandbox **without network access**, so `npm install`, `next build`, ESLint, Vitest and Playwright have **not been run yet**. The dependency-free core (pricing, coupons, risk, attribution, Meta dedup, profit, RBAC, payment/courier verification, CSV, sanitizer) **is tested: 37/37 passing**. Run the commands in [Setup](#8-setup-instructions) on your machine first and fix anything the type checker reports. See [Known limitations](#15-known-limitations).

---

## 1. Project structure

```
prisma/
  schema.prisma          # normalized PostgreSQL schema (49 tables)
  seed.ts                # DEMO data (clearly marked)
public/
  demo/                  # generated placeholder product/category/hero images
  icons/ sw.js offline.html
scripts/
  backup.sh              # daily/weekly/monthly pg_dump → S3-compatible, with retention
  abandoned-carts.ts
src/
  core/                  # PURE business logic — no DB, no framework, unit tested
    money.ts pricing.ts coupons.ts risk.ts attribution.ts order-status.ts
    tracking.ts tracking-shared.ts profit.ts segments.ts rbac.ts phone.ts
    search.ts locations.ts payments/types.ts courier/types.ts
  server/                # server-only services (Prisma, gateways, couriers…)
    db.ts env.ts crypto.ts logger.ts errors.ts rate-limit.ts settings.ts
    auth/ (password, session, login+2FA, admin guard, customer)
    catalog.ts cart.ts orders.ts inventory.ts shipments.ts coupons.ts
    customers.ts analytics.ts abandoned-carts.ts homepage.ts wishlist.ts
    products-admin.ts storage.ts activity.ts
    payments/ (registry, providers: cod, bkash, sslcommerz, manual wallets, mock)
    courier/providers.ts (steadfast, pathao, redx, paperfly*, ecourier*, mock)
    tracking/ (meta CAPI, first-party funnel events, GA4 Measurement Protocol)
    notifications/ (admin + customer; email/SMS/WhatsApp providers)
    ai/ (provider adapter, business assistant w/ DB tools, product writer, support bot)
  validation/            # zod schemas shared by routes & actions
  lib/                   # utils, csv, sanitize, seo, api client
  components/
    ui/                  # Button, fields, Sheet (dialog), Toast, Badge, Price…
    store/               # header, cart, product, checkout, tracking, chat…
    admin/               # shell, tables, charts, product form, action forms
  app/
    (store)/             # customer-facing routes
    admin/               # admin panel (login, (panel)/…, _actions/)
    api/                 # REST endpoints (cart, checkout, payments, track, cron…)
    sitemap.ts robots.ts manifest.ts not-found.tsx error.tsx
  middleware.ts          # visitor id, UTM capture, admin gate
tests/
  core/                  # node:test — runs without dependencies
  unit/                  # vitest
  e2e/                   # playwright (customer + admin flows, overflow check)
```

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15.5** (App Router, RSC, Server Actions), React 19, TypeScript strict | Latest Next major (16) changes middleware/caching APIs; 15.5 is the stable, well-documented target. Upgrade later with `npx @next/codemod upgrade`. |
| Styling | Tailwind CSS 4, hand-built shadcn-style primitives | No UI runtime library → small bundles. |
| DB | PostgreSQL 16 + Prisma 6, `pg_trgm` | Relational integrity, trigram typo-tolerant search. |
| Cache / rate limit | Redis (optional, in-memory fallback) | Required for multi-instance rate limiting. |
| Storage | S3-compatible (R2 / S3 / Spaces / MinIO) via presigned uploads | Images never pass through the app server. |
| Auth | Own session auth: httpOnly `__Host-` cookies, hashed tokens in DB, bcrypt(12), TOTP 2FA | No third-party auth dependency; sessions revocable. |
| Charts | Recharts (admin only) | Not shipped to customers. |
| Tests | node:test, Vitest, Playwright | Core logic tests run anywhere. |

**Architecture decisions**
- **Money is integer poisha** everywhere (`1 ৳ = 100`). No floats.
- **Stock lives on variants**; `available = stock − reserved`. Orders reserve with a conditional `UPDATE … WHERE stock - reserved >= qty` (no overselling under concurrency); shipping fulfils; cancellation releases; returns restock. Every change writes `inventory_logs`.
- **Server-calculated totals only.** The client sends variant ids, quantities, address and payment method. Prices, discounts, shipping and totals are recalculated from the DB inside the order transaction.
- **Admin mutations use Server Actions** with a permission check in each action (not just the layout).
- **First-party funnel events** (`marketing_events`) are the source of truth for visitors / views / add-to-carts / checkouts, so reports don't depend on Meta or GA.

## 3. Database schema overview

49 tables (see `prisma/schema.prisma`). Key groups:

- **Auth/RBAC:** `users`, `roles`, `permissions`, `role_permissions`, `sessions`
- **Catalog:** `categories` (tree), `brands`, `products`, `product_images`, `product_variants` (SKU, price, cost, stock, reserved, weight, image), `product_attributes`, `product_relations`
- **Inventory:** `inventory_logs`, `suppliers`, `purchase_records`
- **Customers:** `customers` (unique phone), `addresses`, `wishlists`, `wishlist_items`
- **Cart:** `carts` (status ACTIVE/ABANDONED/RECOVERED/CONVERTED, contact capture), `cart_items`, `cart_recoveries`
- **Orders:** `orders` (totals, risk, source, device, cost snapshot, Meta event id, idempotency key), `order_items` (price/cost snapshots, allocated discount), `order_status_history`, `payments`, `webhook_events` (replay protection), `shipments`, `shipment_events`, `shipping_zones`
- **Marketing:** `coupons`, `coupon_redemptions`, `campaigns`, `ad_spend`, `attributions` (UTM + click ids + first touch), `marketing_events`, `meta_event_logs` (unique `(eventName, eventId)`), `newsletter_subscribers`
- **Finance:** `expenses`, `profit_records` (per-order true-profit snapshot)
- **System/CMS:** `notifications`, `admin_activity_logs`, `settings` (JSON per section, secrets AES-256-GCM encrypted), `homepage_sections`, `pages`, `faqs`, `blog_posts`

Indexes on all foreign keys and report filters (status+date, campaign, channel, phone), a GIN trigram index on product names, and unique constraints for SKUs, slugs, phones, coupon codes, transaction ids and event ids.

## 4. API overview

| Method | Route | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/cart` | View / add / update cart (server-priced) |
| POST | `/api/cart/coupon` | Apply/remove coupon (rate limited) |
| POST | `/api/cart/contact` | Save checkout contact for abandoned-cart recovery |
| POST | `/api/checkout` | Place order (idempotent; totals computed server-side) |
| GET/POST | `/api/payments/[provider]/callback` | Gateway return → server verification → redirect |
| POST | `/api/payments/[provider]/ipn` | Gateway server notification (idempotent) |
| POST | `/api/payments/manual` | Customer submits wallet TrxID |
| POST | `/api/track` | Browser events → funnel table + Meta CAPI (same event_id) |
| GET | `/api/search/suggest` | Autocomplete + "did you mean" |
| GET/POST | `/api/wishlist`, `/api/wishlist/move` | Wishlist toggle / move to cart |
| POST | `/api/reviews`, `/api/reviews/[id]/report` | Submit (moderated) / report review |
| POST | `/api/orders/lookup` | Order tracking (order # **and** phone) |
| POST | `/api/chat` | Support chatbot (order info only after order # + phone) |
| POST | `/api/account/{login,register,logout}` | Optional customer accounts |
| POST | `/api/newsletter` | Subscribe |
| GET | `/api/cron/[job]` | `abandoned-carts`, `courier-sync`, `meta-retry`, `cleanup` (Bearer `CRON_SECRET`) |
| POST | `/api/admin/upload` | Presigned image upload |
| GET/POST | `/api/admin/products/{export,import}` | CSV export / import |
| POST | `/api/admin/ai/{assistant,product-writer}` | AI tools |
| GET | `/api/health` | Liveness + DB check |

All inputs validated with zod; errors return `{ error: { code, message, fields? } }` and never stack traces.

## 5. Admin panel routes

`/admin/login` · `/admin/login/2fa` · `/admin` (dashboard) · `/admin/orders` · `/admin/orders/[id]` · `/admin/orders/[id]/print?type=invoice|packing` · `/admin/customers` · `/admin/customers/[id]` · `/admin/abandoned-carts` · `/admin/products` · `/admin/products/new` · `/admin/products/[id]` · `/admin/products/import` · `/admin/categories` · `/admin/inventory` · `/admin/reviews` · `/admin/coupons` · `/admin/marketing/campaigns` · `/admin/marketing/meta` · `/admin/marketing/events` · `/admin/profit` · `/admin/expenses` · `/admin/content/homepage` · `/admin/content/pages` · `/admin/ai` · `/admin/users` · `/admin/activity` · `/admin/notifications` · `/admin/settings` · `/admin/settings/[section]` · `/admin/forbidden`

## 6. Customer-facing routes

`/` · `/products` · `/products/[slug]` · `/category/[slug]` · `/search?q=` · `/cart` · `/cart/recover/[token]` · `/checkout` · `/checkout/success` · `/checkout/payment-failed` · `/track` · `/wishlist` · `/account` · `/pages/[slug]` (about, contact, privacy-policy, terms, return-policy, shipping-policy, faq) · `/blog` · `/blog/[slug]` · `/sitemap.xml` · `/robots.txt` · `/manifest.webmanifest`

## 7. Environment variables

See **`.env.example`** (placeholders only). Required to boot: `DATABASE_URL`, `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`), `SESSION_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_SITE_URL`. Everything else enables an integration. Meta/Google IDs can be set either in `.env` or in Admin (DB value wins; tokens are encrypted).

## 8. Setup instructions

```bash
# 1. Prerequisites: Node 20.11+ (22 recommended), Docker (or your own Postgres 16 + Redis)
cd ecommerce-platform
cp .env.example .env            # fill APP_ENCRYPTION_KEY, SESSION_SECRET, SEED_ADMIN_*
docker compose up -d            # postgres, redis, minio

# 2. Install & create the database
npm install
npx prisma migrate dev --name init   # creates tables + pg_trgm extension
npm run db:seed                      # DEMO data; prints admin login

# 3. Run
npm run dev                          # http://localhost:3000  ·  admin: /admin
```

Then verify everything compiles and passes:

```bash
npm run typecheck && npm run lint && npm test
npx playwright install && npm run test:e2e
```

## 9. Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm test` | Core tests (node:test) + Vitest unit tests |
| `npm run test:core` | Core tests only — no install needed beyond Node 22 |
| `npm run test:e2e` | Playwright: desktop, iPhone 13, low-end Android (Galaxy S5) |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |
| `npm run jobs:backup` | Run backup script |

## 10. Production deployment

**Vercel**
1. Managed Postgres (Neon / Supabase / RDS) and Redis (Upstash). Set all env vars in the project.
2. Build command: `prisma migrate deploy && npm run build`.
3. `vercel.json` already defines the cron jobs; set `CRON_SECRET`.
4. Storage: Cloudflare R2 with a public bucket / custom domain → `STORAGE_PUBLIC_BASE_URL`, `STORAGE_PUBLIC_HOST`. Configure CORS on the bucket to allow `PUT` from your domain.

**VPS (Docker)**
1. `docker build -t shop .` then run with your `.env` behind Nginx/Caddy (TLS, gzip/brotli, `client_max_body_size 6m`).
2. Run Postgres with daily `scripts/backup.sh` (cron) to an **off-server** bucket; enable bucket lifecycle rules.
3. Add system cron for `/api/cron/*` (see `src/app/api/cron/[job]/route.ts`).
4. Put Cloudflare in front for CDN + caching of `/_next/static` and `/demo`, `/icons`.

**Before going live:** change the seed admin password, enable 2FA (Settings → Security → require 2FA), set gateways to live mode, remove `META_TEST_EVENT_CODE`, disable the `mock` payment method, register IPN URLs with SSLCommerz/bKash, and verify your domain in Meta Business Manager.

## 11. Third-party integrations required

| Integration | What you need | Where |
|---|---|---|
| bKash Tokenized Checkout | Merchant app key/secret/username/password | `.env` `BKASH_*` |
| SSLCommerz (cards, MFS, net banking) | Store ID / password, IPN URL `/api/payments/sslcommerz/ipn` | `.env` |
| Nagad / Rocket | Merchant wallet numbers (manual TrxID flow included); Nagad API can be added as a provider | Admin → Settings → Payment |
| Steadfast / Pathao / RedX | API credentials (Pathao: store id) | `.env` |
| Paperfly / eCourier | Merchant API docs + keys (adapter registered, not implemented) | `src/server/courier/providers.ts` |
| Meta | Pixel ID + CAPI token (Events Manager) | Admin → Marketing → Meta tracking |
| Google | GA4 Measurement ID (+ API secret for refunds), GTM, Google Ads ID/label | Admin → Settings → Google |
| SMS | Any HTTP BD gateway (BulkSMSBD, SSL Wireless, Alpha…) | `.env` `SMS_*` |
| Email | Resend (or add a provider) | `.env` `EMAIL_*` |
| WhatsApp | Cloud API token + phone number id (templates for >24h messages) | `.env` |
| AI | Anthropic or OpenAI API key | `.env` `AI_*` |
| Storage | S3-compatible bucket | `.env` `STORAGE_*` |

## 12. Testing report

| Suite | Where it ran | Result |
|---|---|---|
| `tests/core` (37 tests: totals, coupons, risk, attribution/UTM, phone, segments, order state machine, Meta CAPI payload + hashing + dedup ids, true profit, ROAS, RBAC, payment verification, courier status mapping, search typo tolerance, zones, CSV injection, HTML sanitizer) | Sandbox (Node 22, no deps) | **37 / 37 pass** |
| Core modules strict type check | Sandbox (`tsc --strict --noUncheckedIndexedAccess`) | Pass (only missing `@types/node`) |
| `tests/unit` (Vitest: checkout validation strips client prices, taka→poisha, coupon input, log redaction, nav permissions) | **Not run** — needs `npm install` | — |
| `tests/e2e` (Playwright: Product→Cart→Checkout→COD order; Admin login→product→order→inventory; marketing manager blocked from users; no horizontal overflow; price tampering) | **Not run** — needs install + DB | — |
| Full-project `tsc` / ESLint / `next build` | **Not run** — needs install | A dependency-free parse of all 190+ TS/TSX files found no syntax errors. |

## 13. Performance report

Built in (to be measured with Lighthouse after deploy):
- Server Components by default; client JS limited to cart, variant picker, gallery, search, checkout, chat, tracking. No UI framework runtime; Recharts only in admin.
- ISR: home (60 s), product pages (300 s, top 200 pre-rendered), CMS/blog; tag revalidation on admin saves.
- `next/image` with AVIF/WebP, responsive `sizes`, `priority` + `fetchPriority=high` only on the LCP image; scroll-snap carousels (no carousel JS); video loads on tap only.
- Fonts self-hosted via `next/font` with `display: swap`; third-party tags `afterInteractive`; tracking uses `sendBeacon`.
- Skeleton `loading.tsx` for listing/product routes; optimistic cart updates.
- DB: indexes on every hot filter, one aggregate query for CRM list (no N+1), trigram GIN index for search, denormalised rating/sold/view counters.
- Targets: LCP < 2.5 s on 4G mid-range Android, CLS < 0.05, JS < 120 KB gz on product page.

## 14. Security checklist

- [x] bcrypt(12) passwords; constant-time login for unknown emails; lockout after N failures; rate limits on login, 2FA, checkout, coupon, tracking, reviews, lookup, chat
- [x] Sessions: random 256-bit tokens, stored as HMAC hashes, `__Host-` httpOnly Secure SameSite=Lax cookies, server-side revocation, re-login on password change/deactivation
- [x] TOTP 2FA for admins (optional or enforced), encrypted secret
- [x] RBAC: 8 roles, 28 granular permissions, checked in every page, action and admin API route
- [x] Activity log: logins, failures, price/stock/status/settings changes, customer-data access
- [x] Prices, discounts, stock, totals, roles never trusted from the client
- [x] Payments: server-to-server verification of amount, order id, currency, transaction id; duplicate/replay protection (`webhook_events`, unique txn id)
- [x] Zod validation on all inputs; Prisma parameterised queries (raw SQL uses tagged templates)
- [x] XSS: React escaping, allow-list HTML sanitizer for rich text, escaped JSON-LD
- [x] CSRF: SameSite cookies + Next.js Server Action origin checks; JSON APIs require `Content-Type: application/json`
- [x] Security headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy
- [x] Secrets only in env or AES-256-GCM-encrypted settings; CAPI token never sent to browser; masked in admin
- [x] Logs redact token/password/cookie/card keys; PII hashed before sending to Meta
- [x] CSV export protected from formula injection; uploads type/size restricted and presigned
- [x] Order details on success page only for the browser that placed the order; tracking requires order # + phone
- [x] Service worker never caches API, cart, checkout, account or admin

## 15. Known limitations

1. **Not yet installed/built/run** (sandbox had no network). Expect a short round of type/lint fixes on first `npm run typecheck`.
2. **Paperfly and eCourier** adapters are registered but not implemented (no public API docs/credentials). **Nagad** is supported via manual TrxID verification; its RSA-signed API can be added as a provider.
3. **Rocket** has no public checkout API → manual TrxID verification by admin.
4. **Customer login** is phone + password (no SMS OTP yet; needs an SMS gateway with OTP).
5. **Product search** uses Postgres trigram — fine to ~100k SKUs; swap `searchProductIds()` for Meilisearch/Typesense beyond that.
6. **Ad spend** is entered manually (or via CSV/API later); there's no automatic Meta Marketing API import.
7. **Rich text** editing is HTML in a textarea (sanitized), not a WYSIWYG editor.
8. Demo images are generated placeholders.
9. Tax is configurable but not yet applied to totals (BD retail prices are usually VAT-inclusive).

## 16. Recommended next steps

1. Run setup + `npm run check` + e2e; fix any reported issues.
2. Get gateway sandbox credentials (bKash, SSLCommerz) and courier keys; run a full paid order + courier booking in sandbox.
3. Connect Meta Pixel/CAPI with a test event code; confirm deduplication in Events Manager.
4. Replace demo images and content; set store settings, shipping zones, payment numbers.
5. Lighthouse on a throttled Android profile; tune hero image weights.
6. Add: Meta Marketing API spend import, SMS OTP login, WYSIWYG editor, Meilisearch.
7. Set up monitoring (Sentry for errors; uptime on `/api/health`) and verify a backup restore.
