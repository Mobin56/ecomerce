"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible drawer / bottom sheet on top of <dialog> (focus trap, Esc,
 * inert background for free). side="bottom" on mobile is a bottom sheet.
 */
export function Sheet({ open, onClose, title, side = "right", children, footer, className }: { open: boolean; onClose: () => void; title: string; side?: "right" | "bottom" | "left"; children: ReactNode; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const pos = {
    right: "ml-auto h-dvh max-h-dvh w-full max-w-md rounded-l-2xl",
    left: "mr-auto h-dvh max-h-dvh w-full max-w-sm rounded-r-2xl",
    bottom: "mt-auto max-h-[88dvh] w-full max-w-none rounded-t-3xl sm:mx-auto sm:mb-auto sm:max-w-lg sm:rounded-3xl",
  }[side];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn("m-0 flex-col bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 open:flex", pos, className)}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="-mr-2 rounded-full p-2 hover:bg-line/60" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="safe-bottom border-t border-line p-4">{footer}</div>}
    </dialog>
  );
}
