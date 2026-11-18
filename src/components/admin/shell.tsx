"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; group: string };

export function AdminShell({ nav, user, unread, storeName, logout, children }: { nav: NavItem[]; user: { name: string; role: string }; unread: number; storeName: string; logout: () => Promise<void>; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(nav.map((n) => n.group))];
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const sidebar = (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/admin" className="font-display text-lg font-semibold">{storeName}</Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</p>
            {nav.filter((n) => n.group === g).map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={isActive(n.href) ? "page" : undefined} className={cn("block rounded-lg px-3 py-2 text-sm", isActive(n.href) ? "bg-ink font-semibold text-white" : "text-ink-soft hover:bg-line/60")}>
                {n.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-4 text-sm">
        <p className="font-semibold">{user.name}</p>
        <p className="text-xs text-muted">{user.role}</p>
        <form action={logout}><button className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"><LogOut size={13} /> Sign out</button></form>
      </div>
    </nav>
  );
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-card lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" target="_blank" className="text-xs font-medium text-muted hover:text-ink">View store ↗</Link>
            <Link href="/admin/notifications" className="relative rounded-full p-2 hover:bg-line/60" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
