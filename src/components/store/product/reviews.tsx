"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Flag } from "lucide-react";
import { Rating } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type R = { id: string; authorName: string; rating: number; title: string | null; body: string; images: string[]; verified: boolean; adminReply: string | null; createdAt: string };

export function ReviewsSection({ productId, ratingAvg, ratingCount, distribution, reviews }: { productId: string; ratingAvg: number; ratingCount: number; distribution: Record<number, number>; reviews: R[] }) {
  const [writing, setWriting] = useState(false);
  const toast = useToast();
  return (
    <section id="reviews" className="mt-16 scroll-mt-24">
      <h2 className="font-display text-2xl font-semibold">Customer reviews</h2>
      <div className="mt-6 grid gap-10 lg:grid-cols-[280px_1fr]">
        <div>
          <p className="text-4xl font-bold">{ratingCount ? ratingAvg.toFixed(1) : "–"}</p>
          <Rating value={ratingAvg} count={ratingCount} size={16} />
          <div className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = distribution[n] ?? 0;
              const pct = ratingCount ? (c / ratingCount) * 100 : 0;
              return (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-3">{n}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-ink" style={{ width: `${pct}%` }} /></div>
                  <span className="w-6 text-right text-muted">{c}</span>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="mt-5 w-full" onClick={() => setWriting((w) => !w)}>{writing ? "Cancel" : "Write a review"}</Button>
        </div>
        <div>
          {writing && <ReviewForm productId={productId} onDone={() => setWriting(false)} />}
          {reviews.length === 0 && !writing && <p className="text-sm text-muted">No reviews yet. Be the first to review this product.</p>}
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-5">
                <div className="flex items-center justify-between">
                  <Rating value={r.rating} />
                  <time className="text-xs text-muted" dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                </div>
                {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{r.body}</p>
                {r.images.length > 0 && (
                  <div className="mt-3 flex gap-2">{r.images.map((src) => <span key={src} className="relative h-20 w-20 overflow-hidden rounded-lg bg-paper"><Image src={src} alt="Customer photo" fill sizes="80px" className="object-cover" /></span>)}</div>
                )}
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.authorName}</span>
                  {r.verified && <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><BadgeCheck size={14} /> Verified purchase</span>}
                  <button
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
                    onClick={async () => {
                      const reason = window.prompt("Why are you reporting this review?");
                      if (!reason) return;
                      await api(`/api/reviews/${r.id}/report`, { body: { reason } }).then(() => toast("Thanks, we'll take a look.")).catch(() => toast("Could not report", "error"));
                    }}
                  >
                    <Flag size={12} /> Report
                  </button>
                </div>
                {r.adminReply && <p className="mt-3 rounded-xl bg-paper p-3 text-sm"><span className="font-semibold">Store reply: </span>{r.adminReply}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ReviewForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<{ loading?: boolean; error?: string; fields?: Record<string, string[] | undefined> }>({});
  const toast = useToast();
  return (
    <form
      className="mb-6 space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setState({ loading: true });
        try {
          const r = await api<{ message: string }>("/api/reviews", { body: { productId, rating, name: f.get("name"), phone: f.get("phone") || undefined, title: f.get("title") || undefined, body: f.get("body"), images: [] } });
          toast(r.message);
          onDone();
        } catch (err) {
          setState({ error: err instanceof ApiError ? err.message : "Could not submit", fields: err instanceof ApiError ? err.fields : undefined });
        }
      }}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`} aria-pressed={rating === n} className={`text-2xl ${n <= rating ? "text-ink" : "text-line"}`}>★</button>)}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="rv-name" error={state.fields?.name?.[0]}><Input id="rv-name" name="name" required /></Field>
        <Field label="Phone (for verified badge)" htmlFor="rv-phone" error={state.fields?.phone?.[0]} hint="Not shown publicly"><Input id="rv-phone" name="phone" inputMode="tel" /></Field>
      </div>
      <Field label="Title" htmlFor="rv-title"><Input id="rv-title" name="title" /></Field>
      <Field label="Review" htmlFor="rv-body" error={state.fields?.body?.[0]}><Textarea id="rv-body" name="body" required minLength={10} /></Field>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" loading={state.loading}>Submit review</Button>
    </form>
  );
}
