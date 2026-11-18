import type { Metadata, Viewport } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { getSettings } from "@/server/settings";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", weight: ["500", "600"] });

export async function generateMetadata(): Promise<Metadata> {
  const [seo, store] = await Promise.all([getSettings("seo"), getSettings("store")]);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: seo.defaultTitle, template: seo.titleTemplate },
    description: seo.defaultDescription,
    applicationName: store.name,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: store.name, locale: "en_BD", images: seo.ogImage ? [seo.ogImage] : undefined },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: store.name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafaf7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
