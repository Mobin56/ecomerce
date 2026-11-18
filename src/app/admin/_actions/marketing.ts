"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, AppError, type ActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/auth/admin";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { saveSettings } from "@/server/settings";
import { retryFailedMetaEvents, sendMetaEvent } from "@/server/tracking/meta";
import { couponInputSchema, campaignSchema, adSpendSchema, expenseSchema } from "@/validation";
import { newEventId } from "@/core/tracking";

type R = Promise<ActionResult<unknown>>;

export async function saveCouponAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("coupons.manage");
    const id = (fd.get("id") as string) || undefined;
    const raw = Object.fromEntries(fd);
    const split = (k: string) => String(raw[k] ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const c = couponInputSchema.parse({ ...raw, productIds: split("productIds"), categoryIds: split("categoryIds"), customerPhones: split("customerPhones"), firstOrderOnly: raw.firstOrderOnly === "on", isActive: raw.isActive === "on", startsAt: raw.startsAt || null, expiresAt: raw.expiresAt || null });
    const { customerPhones, ...data } = c;
    const customers = customerPhones.length ? await db.customer.findMany({ where: { phone: { in: customerPhones } }, select: { id: true } }) : [];
    if (customerPhones.length && customers.length !== customerPhones.length) throw new AppError("UNKNOWN_CUSTOMER", "Some phone numbers don't belong to existing customers.");
    const saved = id
      ? await db.coupon.update({ where: { id }, data: { ...data, customers: { set: customers } } })
      : await db.coupon.create({ data: { ...data, customers: { connect: customers } } });
    await logActivity({ userId: admin.id, action: id ? "coupon.updated" : "coupon.created", entityType: "coupon", entityId: saved.id, after: { code: saved.code, type: saved.type, value: saved.value } });
    revalidatePath("/admin/coupons");
  }, "Coupon saved");
}

export async function toggleCouponAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("coupons.manage");
    const id = String(fd.get("id"));
    const c = await db.coupon.findUniqueOrThrow({ where: { id } });
    await db.coupon.update({ where: { id }, data: { isActive: !c.isActive } });
    await logActivity({ userId: admin.id, action: "coupon.toggled", entityType: "coupon", entityId: id, after: { isActive: !c.isActive } });
    revalidatePath("/admin/coupons");
  });
}

export async function saveCampaignAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("marketing.manage");
    const raw = Object.fromEntries(fd);
    const c = campaignSchema.parse({ ...raw, startsAt: raw.startsAt || null, endsAt: raw.endsAt || null });
    await db.campaign.upsert({ where: { utmCampaign: c.utmCampaign }, create: c, update: c });
    await logActivity({ userId: admin.id, action: "campaign.saved", entityType: "campaign", after: { name: c.name, utm: c.utmCampaign } });
    revalidatePath("/admin/marketing/campaigns");
  }, "Campaign saved");
}

export async function saveAdSpendAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("marketing.manage");
    const s = adSpendSchema.parse(Object.fromEntries(fd));
    await db.adSpend.upsert({ where: { campaignId_date: { campaignId: s.campaignId, date: s.date } }, create: s, update: s });
    await logActivity({ userId: admin.id, action: "adspend.saved", entityType: "campaign", entityId: s.campaignId, after: { date: s.date, amount: s.amount } });
    revalidatePath("/admin/marketing/campaigns");
  }, "Ad spend recorded");
}

export async function saveMetaSettingsAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("marketing.manage");
    const raw = Object.fromEntries(fd);
    const { before, after } = await saveSettings("meta", { pixelId: String(raw.pixelId ?? "").trim(), capiAccessToken: String(raw.capiAccessToken ?? ""), testEventCode: String(raw.testEventCode ?? "").trim(), pixelEnabled: raw.pixelEnabled === "on", capiEnabled: raw.capiEnabled === "on" });
    await logActivity({ userId: admin.id, action: "settings.changed", entityType: "settings", entityId: "meta", before: { pixelId: before.pixelId, pixelEnabled: before.pixelEnabled, capiEnabled: before.capiEnabled, tokenChanged: false }, after: { pixelId: after.pixelId, pixelEnabled: after.pixelEnabled, capiEnabled: after.capiEnabled, tokenChanged: before.capiAccessToken !== after.capiAccessToken } });
    revalidatePath("/", "layout");
  }, "Meta settings saved");
}

export async function testMetaEventAction(_?: unknown, __?: FormData): R {
  return action(async () => {
    await requireAdmin("marketing.manage");
    const r = await sendMetaEvent({ eventName: "PageView", eventId: newEventId("test"), sourceUrl: process.env.NEXT_PUBLIC_SITE_URL, user: { externalId: "admin-test", userAgent: "admin-test", ip: "127.0.0.1" } });
    if (r !== "SENT") throw new AppError("CAPI", r === "DISABLED" ? "CAPI is disabled or not configured." : "Meta rejected the event — see Event logs for the error.");
  }, "Test event sent. Check Events Manager → Test events.");
}

export async function retryMetaAction(_?: unknown, __?: FormData): R {
  return action(async () => {
    await requireAdmin("marketing.manage");
    const r = await retryFailedMetaEvents();
    revalidatePath("/admin/marketing/events");
    return r;
  }, "Retry started");
}

export async function saveExpenseAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("finance.manage");
    const e = expenseSchema.parse(Object.fromEntries(fd));
    const saved = await db.expense.create({ data: e });
    await logActivity({ userId: admin.id, action: "expense.created", entityType: "expense", entityId: saved.id, after: { category: e.category, amount: e.amount } });
    revalidatePath("/admin/expenses");
  }, "Expense added");
}

export async function deleteExpenseAction(_: unknown, fd: FormData): R {
  return action(async () => {
    const admin = await requireAdmin("finance.manage");
    const id = z.string().parse(fd.get("id"));
    const e = await db.expense.delete({ where: { id } });
    await logActivity({ userId: admin.id, action: "expense.deleted", entityType: "expense", entityId: id, before: { category: e.category, amount: e.amount } });
    revalidatePath("/admin/expenses");
  }, "Expense deleted");
}
