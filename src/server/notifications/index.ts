import "server-only";
import { db } from "../db";
import { getSettings } from "../settings";
import { logger } from "../logger";
import { emailProvider, smsProvider, whatsappProvider } from "./providers";
import { formatMoney } from "@/core/money";

const log = logger("notifications");

/** In-app (admin bell) + optional email/SMS to admin contacts. Never throws. */
export async function notifyAdmins(n: { type: string; title: string; body: string; data?: Record<string, unknown>; urgent?: boolean }) {
  try {
    // De-duplicate repeated alerts (e.g. low stock) within 6 hours.
    if (n.type === "low_stock" || n.type === "out_of_stock") {
      const recent = await db.notification.findFirst({
        where: { audience: "ADMIN", type: n.type, body: n.body, createdAt: { gt: new Date(Date.now() - 6 * 3600_000) } },
        select: { id: true },
      });
      if (recent) return;
    }
    await db.notification.create({ data: { audience: "ADMIN", channel: "in_app", type: n.type, title: n.title, body: n.body, data: n.data as object | undefined, status: "SENT" } });
    if (n.urgent) {
      const cfg = await getSettings("notifications");
      await Promise.all([
        ...cfg.adminEmails.map((to) => emailProvider().send({ to, subject: n.title, text: n.body })),
        ...cfg.adminPhones.map((to) => smsProvider().send({ to, text: `${n.title}: ${n.body}` })),
      ]);
    }
  } catch (e) {
    log.error("notifyAdmins failed", { error: e, type: n.type });
  }
}

type CustomerEvent = "order_confirmation" | "order_shipped" | "order_delivered" | "order_cancelled" | "payment_confirmation";

const TEMPLATES: Record<CustomerEvent, (o: { number: number; total: number; storeName: string; trackingId?: string | null }) => { title: string; body: string }> = {
  order_confirmation: (o) => ({ title: `Order #${o.number} received`, body: `Thank you! Your order #${o.number} (${formatMoney(o.total)}) has been received. — ${o.storeName}` }),
  payment_confirmation: (o) => ({ title: `Payment received for #${o.number}`, body: `We received your payment of ${formatMoney(o.total)} for order #${o.number}. — ${o.storeName}` }),
  order_shipped: (o) => ({ title: `Order #${o.number} shipped`, body: `Your order #${o.number} is on the way${o.trackingId ? `. Tracking: ${o.trackingId}` : ""}. — ${o.storeName}` }),
  order_delivered: (o) => ({ title: `Order #${o.number} delivered`, body: `Your order #${o.number} has been delivered. Enjoy! — ${o.storeName}` }),
  order_cancelled: (o) => ({ title: `Order #${o.number} cancelled`, body: `Your order #${o.number} has been cancelled. Contact us if this is unexpected. — ${o.storeName}` }),
};

/** Customer order notifications on enabled channels. Logged; never throws. */
export async function notifyCustomer(event: CustomerEvent, orderId: string) {
  try {
    const [order, cfg, store] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipments: { orderBy: { createdAt: "desc" }, take: 1 } } }),
      getSettings("notifications"),
      getSettings("store"),
    ]);
    const msg = TEMPLATES[event]({ number: order.number, total: order.total, storeName: store.name, trackingId: order.shipments[0]?.trackingId });
    const jobs: { channel: string; recipient: string; run: () => Promise<void> }[] = [];
    if (cfg.customerSms) jobs.push({ channel: "sms", recipient: order.shipPhone, run: () => smsProvider().send({ to: order.shipPhone, text: msg.body }) });
    if (cfg.customerEmail && order.shipEmail) jobs.push({ channel: "email", recipient: order.shipEmail, run: () => emailProvider().send({ to: order.shipEmail!, subject: msg.title, text: msg.body }) });
    if (cfg.customerWhatsapp) jobs.push({ channel: "whatsapp", recipient: order.shipPhone, run: () => whatsappProvider().send({ to: order.shipPhone, text: msg.body }) });
    for (const j of jobs) {
      let status = "SENT";
      let error: string | null = null;
      try {
        await j.run();
      } catch (e) {
        status = "FAILED";
        error = e instanceof Error ? e.message : String(e);
      }
      await db.notification.create({ data: { audience: "CUSTOMER", type: event, channel: j.channel, recipient: j.recipient, title: msg.title, body: msg.body, status, error, data: { orderId } } });
    }
  } catch (e) {
    log.error("notifyCustomer failed", { error: e, event, orderId });
  }
}
