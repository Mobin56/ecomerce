"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Expand, PlayCircle } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Img = { id: string; url: string; alt: string; width: number | null; height: number | null };

/** Swipeable (scroll-snap, no JS lib) gallery + hover zoom (desktop) + fullscreen zoom viewer. Video loads only on demand. */
export function Gallery({ images, videoUrl, name }: { images: Img[]; videoUrl: string | null; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [video, setVideo] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [hover, setHover] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    setIndex(i);
    setVideo(false);
    track.current?.children[i]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  if (!images.length) return <div className="aspect-square rounded-3xl bg-card" />;
  return (
    <div className="lg:grid lg:grid-cols-[72px_1fr] lg:gap-4">
      <div className="order-2 mt-3 hidden flex-col gap-3 lg:order-1 lg:mt-0 lg:flex">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => go(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={cn("relative aspect-square overflow-hidden rounded-xl border-2 bg-card", i === index ? "border-ink" : "border-transparent")}>
            <Image src={img.url} alt="" fill sizes="72px" className="object-cover" />
          </button>
        ))}
        {videoUrl && (
          <button onClick={() => setVideo(true)} className="grid aspect-square place-items-center rounded-xl border border-line bg-card" aria-label="Play product video"><PlayCircle /></button>
        )}
      </div>
      <div className="relative order-1 lg:order-2">
        {video && videoUrl ? (
          <div className="aspect-square overflow-hidden rounded-3xl bg-ink">
            <video src={videoUrl} controls autoPlay playsInline className="h-full w-full object-contain" />
          </div>
        ) : (
          <div
            ref={track}
            className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 sm:rounded-3xl"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              if (i !== index) setIndex(i);
            }}
          >
            {images.map((img, i) => (
              <div
                key={img.id}
                className="relative aspect-square w-full shrink-0 snap-start overflow-hidden bg-card sm:rounded-3xl lg:cursor-zoom-in"
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
                }}
                onClick={() => setZoom(true)}
              >
                <Image
                  src={img.url}
                  alt={img.alt || name}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover transition-transform duration-200 lg:[transform:var(--z)]"
                  style={{ transformOrigin: origin, ["--z" as string]: hover && i === index ? "scale(1.9)" : "scale(1)" }}
                />
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setZoom(true)} className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-card/90 shadow" aria-label="Zoom image"><Expand size={17} /></button>
        <div className="mt-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
          {images.map((img, i) => <span key={img.id} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-ink" : "w-1.5 bg-line")} />)}
        </div>
        {videoUrl && <button onClick={() => setVideo((v) => !v)} className="mt-3 inline-flex items-center gap-2 text-sm font-medium lg:hidden"><PlayCircle size={18} /> {video ? "Show photos" : "Watch video"}</button>}
      </div>
      <Sheet open={zoom} onClose={() => setZoom(false)} title={name} side="bottom" className="sm:max-w-4xl">
        <div className="space-y-3 p-3">
          {images.map((img) => (
            <div key={img.id} className="relative aspect-square w-full overflow-auto rounded-2xl bg-paper">
              <Image src={img.url} alt={img.alt} fill sizes="(max-width: 896px) 100vw, 896px" className="object-contain" />
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
