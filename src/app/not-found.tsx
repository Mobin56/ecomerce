import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <p className="font-display text-7xl font-semibold text-line">404</p>
        <h1 className="mt-2 text-2xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may have moved or no longer exists.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Go home</Link>
          <Link href="/products" className="inline-flex h-11 items-center rounded-full border border-line px-6 font-semibold">Browse products</Link>
        </div>
      </div>
    </main>
  );
}
