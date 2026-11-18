import "server-only";
import type { PaymentProvider } from "@/core/payments/types";
import { codProvider, manualWalletProvider, mockProvider } from "./providers/basic";
import { sslcommerzProvider } from "./providers/sslcommerz";
import { bkashProvider } from "./providers/bkash";
import { getSettings } from "../settings";

/**
 * Payment gateway registry. To add a gateway (Nagad API, AamarPay, Stripe...):
 * implement PaymentProvider in ./providers and add it here. Checkout, order
 * service and callbacks need no changes.
 */
export async function allProviders(): Promise<PaymentProvider[]> {
  const pay = await getSettings("payment");
  const n = pay.manualMfsNumbers;
  return [
    codProvider,
    bkashProvider(),
    sslcommerzProvider(),
    manualWalletProvider("bkash_manual", "bKash (Send Money)", n.bkash ?? ""),
    manualWalletProvider("nagad", "Nagad", n.nagad ?? ""),
    manualWalletProvider("rocket", "Rocket", n.rocket ?? ""),
    mockProvider,
  ];
}

/** Providers enabled in Admin > Settings > Payment AND configured. */
export async function enabledProviders(): Promise<PaymentProvider[]> {
  const pay = await getSettings("payment");
  const all = await allProviders();
  return all.filter((p) => p.isConfigured && (pay.enabled.includes(p.key) || (p.key === "mock" && process.env.NODE_ENV !== "production" && pay.enabled.includes("mock"))));
}

export async function getProvider(key: string): Promise<PaymentProvider | null> {
  return (await allProviders()).find((p) => p.key === key) ?? null;
}
