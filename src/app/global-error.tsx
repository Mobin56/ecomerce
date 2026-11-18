"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fafaf7" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page.</p>
          <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 999, border: 0, background: "#141414", color: "#fff" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
