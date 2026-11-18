"use client";

import { useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";

type Msg = { from: "bot" | "me"; text: string };

/** Support chatbot. Order details are only returned after order number + phone are provided. */
export function ChatWidget({ storeName }: { storeName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: `Hi! I'm the ${storeName} assistant. Ask about delivery, returns, payment or your order.` }]);
  const [text, setText] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [auth, setAuth] = useState({ orderNumber: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(message: string) {
    if (!message.trim()) return;
    setMsgs((m) => [...m, { from: "me", text: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ reply: string; needsAuth?: boolean }>("/api/chat", { body: { message, ...(needsAuth && auth.orderNumber ? auth : {}) } });
      setMsgs((m) => [...m, { from: "bot", text: r.reply }]);
      setNeedsAuth(Boolean(r.needsAuth));
    } catch (e) {
      setMsgs((m) => [...m, { from: "bot", text: e instanceof ApiError ? e.message : "Sorry, something went wrong." }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="fixed bottom-20 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-ink text-white shadow-lg transition hover:scale-105 md:bottom-6" aria-label={open ? "Close chat" : "Open support chat"} aria-expanded={open}>
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
      {open && (
        <section aria-label="Support chat" className="fixed bottom-36 right-4 z-40 flex h-[min(520px,70dvh)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl md:bottom-20">
          <header className="border-b border-line px-4 py-3 text-sm font-semibold">Support</header>
          <div className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {msgs.map((m, i) => (
              <p key={i} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "ml-auto bg-ink text-white" : "bg-paper"}`}>{m.text}</p>
            ))}
            {busy && <p className="w-16 rounded-2xl bg-paper px-3 py-2 text-sm text-muted">…</p>}
            <div ref={end} />
          </div>
          {needsAuth && (
            <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
              <input aria-label="Order number" placeholder="Order #" value={auth.orderNumber} onChange={(e) => setAuth({ ...auth, orderNumber: e.target.value })} className="h-9 rounded-lg border border-line px-2 text-sm" />
              <input aria-label="Phone" placeholder="Phone" inputMode="tel" value={auth.phone} onChange={(e) => setAuth({ ...auth, phone: e.target.value })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); void send(text || (needsAuth ? "Check my order status" : "")); }} className="flex gap-2 border-t border-line p-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" className="h-10 min-w-0 flex-1 rounded-full border border-line px-3 text-sm outline-none focus:border-ink" />
            <button type="submit" disabled={busy} className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white disabled:opacity-50" aria-label="Send"><Send size={16} /></button>
          </form>
        </section>
      )}
    </>
  );
}
