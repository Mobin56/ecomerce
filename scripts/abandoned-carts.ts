/** Run the abandoned-cart job from a shell / system cron (alternative to the HTTP cron route). */
const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/cron/abandoned-carts`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
console.log(res.status, await res.text());
export {};
