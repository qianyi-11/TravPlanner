"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { PlaceCover } from "./CategoryIcon";
import { cx } from "@/lib/utils";

/**
 * Photo menu for a place: one large image with a row of clickable thumbnails
 * beneath it, and a full-screen view when the main image is clicked.
 * Falls back to the gradient cover when a place has no real photos.
 */
export function PlaceGallery({
  photos,
  cover,
  category,
  name,
}: {
  photos?: string[];
  cover: string;
  category: string;
  name: string;
}) {
  const all = photos && photos.length > 0 ? photos : [cover];
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const current = all[Math.min(index, all.length - 1)];
  const hasMany = all.length > 1;

  const next = () => setIndex((i) => (i + 1) % all.length);
  const prev = () => setIndex((i) => (i - 1 + all.length) % all.length);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, all.length]);

  return (
    <div className="space-y-2.5">
      {/* main image */}
      <button
        onClick={() => setLightbox(true)}
        className="group relative block w-full overflow-hidden rounded-3xl"
        title="View larger"
      >
        <PlaceCover photo={current} category={category} className="h-60 w-full sm:h-[22rem]" iconSize={44} />
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-black/65">
          <Expand size={13} /> View
        </span>
        {hasMany && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold tabular-nums text-white backdrop-blur-sm">
            {index + 1} / {all.length}
          </span>
        )}
      </button>

      {/* thumbnail menu */}
      {hasMany && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {all.map((photo, i) => (
            <button
              key={`${photo}-${i}`}
              onClick={() => setIndex(i)}
              title={`${name} — photo ${i + 1}`}
              className={cx(
                "shrink-0 overflow-hidden rounded-xl transition-all",
                i === index
                  ? "ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-paper)]"
                  : "opacity-70 hover:opacity-100"
              )}
            >
              <PlaceCover photo={photo} category={category} className="h-16 w-24" iconSize={18} />
            </button>
          ))}
        </div>
      )}

      {/* lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            title="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X size={18} />
          </button>

          {hasMany && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                title="Previous photo"
                className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:left-6"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                title="Next photo"
                className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:right-6"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <figure className="max-h-full w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <PlaceCover
              photo={current}
              category={category}
              className="max-h-[78vh] min-h-[50vh] w-full rounded-2xl"
              iconSize={64}
              fit="contain"
            />
            <figcaption className="mt-3 flex items-center justify-between text-sm text-white/80">
              <span className="truncate font-semibold">{name}</span>
              {hasMany && (
                <span className="shrink-0 tabular-nums">
                  {index + 1} of {all.length}
                </span>
              )}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
