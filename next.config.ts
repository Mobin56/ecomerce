import type { NextConfig } from "next";

const storageHost = process.env.STORAGE_PUBLIC_HOST;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Meta Pixel + GTM/GA4 need these origins. Inline scripts are limited to the tracking bootstrap.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net`,
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      // Storage host is needed for direct (presigned) image uploads from the admin.
      `connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.amazonaws.com https://*.r2.cloudflarestorage.com https://*.digitaloceanspaces.com${process.env.STORAGE_ENDPOINT ? ` ${new URL(process.env.STORAGE_ENDPOINT).origin}` : ""}`,
      "frame-src https://www.googletagmanager.com https://td.doubleclick.net",
      "media-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.sslcommerz.com https://*.bka.sh",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 375, 414, 640, 768, 1024, 1280, 1536, 1920],
    remotePatterns: [
      ...(storageHost ? [{ protocol: "https" as const, hostname: storageHost }] : []),
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
