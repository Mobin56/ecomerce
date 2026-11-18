import "server-only";
import { env } from "../env";
import { logger } from "../logger";
import { maskPhone, toE164Digits } from "@/core/phone";

/**
 * Notification channel providers. Add a new SMS gateway / email service by
 * implementing the interface and switching on the env var. The "log"
 * providers are for development: they print a redacted line instead of sending.
 */

export interface EmailProvider {
  send(m: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}
export interface SmsProvider {
  send(m: { to: string; text: string }): Promise<void>;
}
export interface WhatsappProvider {
  send(m: { to: string; text: string }): Promise<void>;
}

const log = logger("notify");

export function emailProvider(): EmailProvider {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend" && e.EMAIL_API_KEY) {
    return {
      async send(m) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${e.EMAIL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: e.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Email failed: ${res.status}`);
      },
    };
  }
  return { send: async (m) => log.info("email (log provider)", { to: m.to.replace(/^(.).*@/, "$1***@"), subject: m.subject }) };
}

/**
 * Generic HTTP SMS gateway (most BD gateways — BulkSMSBD, SSL Wireless, Alpha
 * SMS — accept api_key/senderid/number/message). Adjust field names in one place.
 */
export function smsProvider(): SmsProvider {
  const e = env();
  if (e.SMS_PROVIDER === "http" && e.SMS_API_URL && e.SMS_API_KEY) {
    return {
      async send(m) {
        const body = new URLSearchParams({ api_key: e.SMS_API_KEY!, senderid: e.SMS_SENDER_ID ?? "", number: toE164Digits(m.to), message: m.text });
        const res = await fetch(e.SMS_API_URL!, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`SMS failed: ${res.status}`);
      },
    };
  }
  return { send: async (m) => log.info("sms (log provider)", { to: maskPhone(m.to), chars: m.text.length }) };
}

/** WhatsApp Cloud API. Note: business-initiated messages outside 24h need approved templates. */
export function whatsappProvider(): WhatsappProvider {
  const e = env();
  if (e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID) {
    return {
      async send(m) {
        const res = await fetch(`https://graph.facebook.com/v21.0/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${e.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: toE164Digits(m.to), type: "text", text: { body: m.text } }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`WhatsApp failed: ${res.status}`);
      },
    };
  }
  return { send: async (m) => log.info("whatsapp (log provider)", { to: maskPhone(m.to) }) };
}
