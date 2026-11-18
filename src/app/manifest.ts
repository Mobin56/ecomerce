import type { MetadataRoute } from "next";
import { getSettings } from "@/server/settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const store = await getSettings("store");
  return {
    name: store.name,
    short_name: store.name.slice(0, 12),
    description: store.tagline,
    start_url: "/?utm_source=pwa",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
