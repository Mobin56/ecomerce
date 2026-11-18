import "server-only";
import { db } from "./db";
import { getSettings } from "./settings";
import { smsProvider, emailProvider, whatsappProvider } from "./notifications/providers";
import { siteUrl } from "./env";
import { logger } from "./logger";
import { formatMoney } from "@/core/money";
import { effectivePrice } from "@/core/pricing";

const log = logger("abandoned-carts");

/**
 * Run every 15 minutes (cron → /api/cron/abandoned-carts).
 * 1. Marks idle carts with items as ABANDONED.
 * 2. Sends at most `maxAttempts` reminders, spaced `hoursBetween`, only to
 *    carts with contact details, never to customers who ordered since, and
 *    never between 10pm–9am Dhaka time (no spam).
 */
export async function processAbandonedCarts(now = new Date()) {
  const cfg = await getSettings("abandonedCart");
  if (!cfg.enabled) return { marked: 0, sent: 0 };

  const idleBefore = new Date(now.getTime() - cfg.afterMinutes * 60_000);
  const marked = await db.cart.updateMany({
    where: { status: "ACTIVE", lastActivityAt: { lt: idleBefore }, items: { some: {} } },
    data: { status: "ABANDONED", abandonedAt: now },
  });

  const dhakaHour = (now.getUTCHours() + 6) % 24;
  if (dhakaHour < 9 || dhakaHour >= 22 || cfg.maxAttempts === 0) return { marked: marked.count, sent: 0 };

  const candidates = await db.cart.findMany({
    where: {
      status: "ABANDONED",
      abandonedAt: { gt: new Date(now.getTime() - 7 * 86_400_000) },
      OR: [{ contactPhone: { not: null } }, { contactEmail: { not: null } }, { customerId: { not: null } }],
    },
    include: {
      customer: true,
      recoveries: { orderBy: { sentAt: "desc" } },
      items: { include: { variant: { include: { product: { select: { name: true, regularPrice: true, salePrice: true } } } } } },
    },
    take: 200,
  });

  let sent = 0;
  const store = await getSettings("store");
  for (const cart of candidates) {
    const attempts = cart.recoveries.filter((r) => r.status === "SENT").length;
    if (attempts >= cfg.maxAttempts) continue;
    const last = cart.recoveries[0];
    if (last && now.getTime() - last.sentAt.getTime() < cfg.hoursBetween * 3600_000) continue;

    const phone = cart.contactPhone ?? cart.customer?.phone ?? null;
    const email = cart.contactEmail ?? cart.customer?.email ?? null;
    if (phone) {
      const orderedSince = await db.order.count({ where: { shipPhone: phone, createdAt: { gt: cart.abandonedAt ?? cart.updatedAt } } });
      if (orderedSince > 0) {
        await db.cart.update({ where: { id: cart.id }, data: { status: "RECOVERED", recoveredAt: now } });
        continue;
      }
    }
    if (!cart.items.length) continue;
    const value = cart.items.reduce((s, i) => {
      const { price } = effectivePrice({ productRegular: i.variant.product.regularPrice, productSale: i.variant.product.salePrice, variantPrice: i.variant.price, variantSale: i.variant.salePrice });
      return s + price * i.quantity;
    }, 0);
    const link = `${siteUrl()}/cart/recover/${cart.token}?utm_source=${attempts === 0 ? "reminder1" : "reminder2"}&utm_medium=${phone ? "sms" : "email"}&utm_campaign=abandoned_cart`;
    const coupon = cfg.couponCode && attempts > 0 ? ` Use code ${cfg.couponCode} for a discount.` : "";
    const text = `${store.name}: You left ${cart.items[0]!.variant.product.name}${cart.items.length > 1 ? ` +${cart.items.length - 1} more` : ""} (${formatMoney(value)}) in your cart.${coupon} Complete your order: ${link}`;

    for (const channel of cfg.channels) {
      let status = "SKIPPED";
      let error: string | null = null;
      try {
        if (channel === "SMS" && phone) {
          await smsProvider().send({ to: phone, text });
          status = "SENT";
        } else if (channel === "EMAIL" && email) {
          await emailProvider().send({ to: email, subject: `You left something in your cart`, text });
          status = "SENT";
        } else if (channel === "WHATSAPP" && phone) {
          await whatsappProvider().send({ to: phone, text });
          status = "SENT";
        }
      } catch (e) {
        status = "FAILED";
        error = e instanceof Error ? e.message : String(e);
        log.warn("recovery send failed", { cartId: cart.id, channel, error });
      }
      if (status !== "SKIPPED") {
        await db.cartRecovery.create({ data: { cartId: cart.id, channel, attempt: attempts + 1, status, error } });
        if (status === "SENT") sent++;
      }
    }
  }
  return { marked: marked.count, sent };
}

export async function abandonedCartStats(from: Date) {
  const [abandoned, recovered, value] = await Promise.all([
    db.cart.count({ where: { abandonedAt: { gte: from } } }),
    db.cart.count({ where: { recoveredAt: { gte: from } } }),
    db.$queryRaw<{ value: number }[]>`
      SELECT COALESCE(SUM(ci.quantity * COALESCE(v."salePrice", v.price, p."salePrice", p."regularPrice")),0)::int AS value
      FROM carts c JOIN cart_items ci ON ci."cartId" = c.id JOIN product_variants v ON v.id = ci."variantId" JOIN products p ON p.id = v."productId"
      WHERE c.status = 'ABANDONED' AND c."abandonedAt" >= ${from}`,
  ]);
  return { abandoned, recovered, recoveryRate: abandoned ? recovered / abandoned : 0, openValue: value[0]?.value ?? 0 };
}
