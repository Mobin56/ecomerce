"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { newEventId, toGa4Items, META_TO_GA4, type MetaEventName, type TrackItem } from "@/core/tracking-shared";
import type { PublicTrackingConfig } from "@/server/settings";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: unknown[];
    __trk?: PublicTrackingConfig;
  }
}

/**
 * Third-party tags load `afterInteractive` (never block first paint).
 * Every browser event goes to: Meta Pixel (with eventID), GA4 (gtag), and
 * /api/track (first-party funnel + CAPI with the SAME eventID for dedup).
 */
export function TrackingScripts({ config }: { config: PublicTrackingConfig }) {
  return (
    <>
      <Script id="trk-config" strategy="beforeInteractive">{`window.__trk=${JSON.stringify(config)}`}</Script>
      {config.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${config.metaPixelId.replace(/\D/g, "")}');`}
        </Script>
      )}
      {config.gtmId && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${config.gtmId.replace(/[^A-Z0-9-]/gi, "")}');`}
        </Script>
      )}
      {(config.ga4Id || config.googleAdsId) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4Id ?? config.googleAdsId ?? "")}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());${config.ga4Id ? `gtag('config','${config.ga4Id.replace(/[^A-Z0-9-]/gi, "")}',{send_page_view:false});` : ""}${config.googleAdsId ? `gtag('config','${config.googleAdsId.replace(/[^A-Z0-9-]/gi, "")}');` : ""}`}
          </Script>
        </>
      )}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}

function PageViewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef<string>("");
  useEffect(() => {
    const url = `${pathname}?${search.toString()}`;
    if (last.current === url) return;
    last.current = url;
    track("PageView", {});
    window.gtag?.("event", "page_view", { page_location: window.location.href, page_title: document.title });
  }, [pathname, search]);
  return null;
}

export interface TrackData {
  items?: TrackItem[];
  value?: number; // poisha
  productId?: string;
  searchString?: string;
  ga4Extra?: Record<string, unknown>;
}

/** Fire a browser event + mirror to server (CAPI) with the same event id. */
export function track(event: MetaEventName, data: TrackData) {
  if (typeof window === "undefined") return;
  const eventId = newEventId(event.toLowerCase());
  const params: Record<string, unknown> = {};
  if (data.items?.length) {
    params.content_ids = data.items.map((i) => i.id);
    params.content_type = "product";
    params.contents = data.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price / 100 }));
    if (data.items.length === 1) params.content_name = data.items[0]!.name;
  }
  if (data.value !== undefined) {
    params.value = data.value / 100;
    params.currency = "BDT";
  }
  if (data.searchString) params.search_string = data.searchString;
  try {
    window.fbq?.("track", event, params, { eventID: eventId });
  } catch {
    /* ad blockers */
  }
  const gaName = META_TO_GA4[event];
  if (gaName) {
    window.gtag?.("event", gaName, {
      currency: "BDT",
      ...(data.value !== undefined ? { value: data.value / 100 } : {}),
      ...(data.items ? { items: toGa4Items(data.items) } : {}),
      ...(data.searchString ? { search_term: data.searchString } : {}),
      ...data.ga4Extra,
    });
  }
  const body = JSON.stringify({ event, eventId, url: window.location.href, productId: data.productId, value: data.value, items: data.items, searchString: data.searchString });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
  else void fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
}

/** GA4-only events with no Meta equivalent. */
export function trackGa(name: "view_item_list" | "select_item" | "remove_from_cart" | "view_cart", params: { items?: TrackItem[]; value?: number; item_list_name?: string }) {
  window.gtag?.("event", name, {
    currency: "BDT",
    ...(params.value !== undefined ? { value: params.value / 100 } : {}),
    ...(params.items ? { items: toGa4Items(params.items) } : {}),
    ...(params.item_list_name ? { item_list_name: params.item_list_name } : {}),
  });
}

/**
 * Purchase in the browser — uses the deterministic order event id so it is
 * merged with the server CAPI Purchase. Guarded by sessionStorage against reloads.
 */
export function PurchaseTracker({ orderId, eventId, value, items, enabled }: { orderId: string; eventId: string; value: number; items: TrackItem[]; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const key = `purchase-tracked:${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    window.fbq?.("track", "Purchase", { value: value / 100, currency: "BDT", content_ids: items.map((i) => i.id), content_type: "product", contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price / 100 })), order_id: orderId }, { eventID: eventId });
    window.gtag?.("event", "purchase", { transaction_id: orderId, value: value / 100, currency: "BDT", items: toGa4Items(items) });
    const cfg = window.__trk;
    if (cfg?.googleAdsId && cfg.googleAdsPurchaseLabel) {
      window.gtag?.("event", "conversion", { send_to: `${cfg.googleAdsId}/${cfg.googleAdsPurchaseLabel}`, value: value / 100, currency: "BDT", transaction_id: orderId });
    }
  }, [orderId, eventId, value, items, enabled]);
  return null;
}
