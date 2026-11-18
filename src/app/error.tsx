"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Never shows stack traces; offers retry. `digest` lets support find the server log line. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">{offline ? "You're offline" : "Something went wrong"}</h1>
        <p className="mt-2 text-muted">{offline ? "Check your internet connection and try again." : "Please try again. If it keeps happening, contact us."}</p>
        {error.digest && <p className="mt-1 text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Try again</button>
          <Link href="/" className="inline-flex h-11 items-center rounded-full border border-line px-6 font-semibold">Go home</Link>
        </div>
      </div>
    </main>
  );
}
