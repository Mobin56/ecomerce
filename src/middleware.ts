import { NextResponse, type NextRequest } from "next/server";
import { touchFromLanding, mergeTouch, encodeAttribution, decodeAttribution, buildFbc } from "@/core/attribution";

/**
 * Edge middleware (runs before every page):
 *  1. Assigns a first-party visitor id (vid) — used for funnel analytics.
 *  2. Captures UTM / fbclid / gclid / referrer into the `attr` cookie and
 *     persists first + last touch for 90 days (attribution through the journey).
 *  3. Sets Meta's _fbc cookie from fbclid when the Pixel hasn't yet.
 *  4. Cheap gate for /admin (full permission checks happen server-side).
 */

const NINETY_DAYS = 60 * 60 * 24 * 90;
const secure = process.env.NODE_ENV === "production";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const hasSession = req.cookies.has(secure ? "__Host-admin_session" : "admin_session");
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const res = NextResponse.next();
  const isDocument = req.method === "GET" && (req.headers.get("sec-fetch-dest") === "document" || req.headers.get("accept")?.includes("text/html"));
  if (!isDocument) return res;

  if (!req.cookies.has("vid")) {
    res.cookies.set("vid", crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  const touch = touchFromLanding(req.url, req.headers.get("referer"));
  if (touch) {
    const prev = decodeAttribution(req.cookies.get("attr")?.value);
    const next = mergeTouch(prev, touch);
    if (next && next !== prev) {
      res.cookies.set("attr", encodeAttribution(next), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: NINETY_DAYS });
    }
    if (touch.fbclid && !req.cookies.has("_fbc")) {
      res.cookies.set("_fbc", buildFbc(touch.fbclid), { sameSite: "lax", secure, path: "/", maxAge: NINETY_DAYS });
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|robots.txt|sitemap.xml|sw.js|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|css|js|woff2?)$).*)"],
};
