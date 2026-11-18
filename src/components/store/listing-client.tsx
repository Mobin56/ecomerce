"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { TrackItem } from "@/core/tracking-shared";
import { trackGa } from "./tracking";

export function FilterDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold lg:hidden"><SlidersHorizontal size={14} /> Filters</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters" side="bottom">
        <div className="p-5">{children}</div>
      </Sheet>
    </>
  );
}

export function ListTracker({ listName, items }: { listName: string; items: TrackItem[] }) {
  useEffect(() => {
    trackGa("view_item_list", { item_list_name: listName, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listName]);
  return null;
}
