import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { CartProvider } from "@/components/store/cart-context";
import { CartDrawer } from "@/components/store/cart-drawer";
import { WishlistProvider } from "@/components/store/wishlist-button";
import { TrackingScripts } from "@/components/store/tracking";
import { ChatWidget } from "@/components/store/chat-widget";
import { ServiceWorkerRegister } from "@/components/store/sw-register";
import { getPublicTrackingConfig, getSettings } from "@/server/settings";
import { JsonLd, organizationLd } from "@/lib/seo";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [tracking, store, ai] = await Promise.all([getPublicTrackingConfig(), getSettings("store"), getSettings("ai")]);
  return (
    <CartProvider>
      <WishlistProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
        <Header />
        <main id="main" className="min-h-[60vh]">{children}</main>
        <Footer />
        <CartDrawer />
        {ai.supportChatbot && <ChatWidget storeName={store.name} />}
        <TrackingScripts config={tracking} />
        <ServiceWorkerRegister />
        <JsonLd data={organizationLd(store)} />
      </WishlistProvider>
    </CartProvider>
  );
}
