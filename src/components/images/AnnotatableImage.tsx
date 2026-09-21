import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** En markerad del av bilden, angiven som andel av bildens bredd och höjd (0–1). */
export type ImageRegion = { x: number; y: number; w: number; h: number };

export type RegionMark = {
  id: string;
  region: ImageRegion;
  /** Numret som visas i rutan och framför kommentaren i listan. */
  number: number;
  label?: string | null;
};

/** Önskad storlek på en ruta i bildens rutnät (bildpunkter på skärmen). */
const CELL = 34;

/**
 * Bilden med ett genomskinligt rutnät ovanpå. I markeringsläget trycker man på
 * en ruta — eller drar över flera — och får tillbaka den markerade ytan, så att
 * kommentaren hamnar på just den delen av bilden. Redan kommenterade delar
 * visas som numrerade rutor som går att trycka på.
 */
export function AnnotatableImage({
  src,
  alt,
  imgClassName,
  marks = [],
  markMode = false,
  activeId = null,
  onRegion,
  onOpenMark,
  children,
}: {
  src: string;
  alt: string;
  imgClassName?: string;
  marks?: RegionMark[];
  markMode?: boolean;
  activeId?: string | null;
  onRegion?: (region: ImageRegion) => void;
  onOpenMark?: (id: string) => void;
  children?: React.ReactNode;
}) {
  const [from, setFrom] = useState<{ c: number; r: number } | null>(null);
  const [to, setTo] = useState<{ c: number; r: number } | null>(null);
  const dragging = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState({ cols: 12, rows: 16 });
  const COLS = grid.cols;
  const ROWS = grid.rows;

  // Rutorna ska vara små och kvadratiska, oavsett bildens format.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      setGrid({
        cols: Math.max(4, Math.round(width / CELL)),
        rows: Math.max(4, Math.round(height / CELL)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cells = from && to
    ? {
        c0: Math.min(from.c, to.c),
        r0: Math.min(from.r, to.r),
        c1: Math.max(from.c, to.c),
        r1: Math.max(from.r, to.r),
      }
    : null;

  const finish = () => {
    if (!cells) return;
    dragging.current = false;
    const region: ImageRegion = {
      x: cells.c0 / COLS,
      y: cells.r0 / ROWS,
      w: (cells.c1 - cells.c0 + 1) / COLS,
      h: (cells.r1 - cells.r0 + 1) / ROWS,
    };
    setFrom(null);
    setTo(null);
    onRegion?.(region);
  };

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="relative inline-block max-w-full align-middle">
      <img
        src={src}
        alt={alt}
        className={cn("block select-none", imgClassName)}
        draggable={false}
        loading="lazy"
        decoding="async"
      />

      {/* Redan kommenterade delar av bilden */}
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.label || undefined}
          aria-label={`Kommentar ${m.number} på bilden`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMark?.(m.id);
          }}
          className={cn(
            "absolute rounded-md border-2 transition-colors",
            activeId === m.id
              ? "border-primary bg-primary/25"
              : "border-white/80 bg-white/10 hover:bg-white/20",
          )}
          style={{
            left: pct(m.region.x),
            top: pct(m.region.y),
            width: pct(m.region.w),
            height: pct(m.region.h),
          }}
        >
          <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {m.number}
          </span>
        </button>
      ))}

      {/* Markeringsläge: genomskinligt rutnät att trycka eller dra i */}
      {markMode && (
        <div
          className="absolute inset-0 touch-none"
          onPointerUp={finish}
          onPointerLeave={() => dragging.current && finish()}
        >
          <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
            {Array.from({ length: COLS * ROWS }).map((_, i) => {
              const c = i % COLS;
              const r = Math.floor(i / COLS);
              const inSel =
                !!cells && c >= cells.c0 && c <= cells.c1 && r >= cells.r0 && r <= cells.r1;
              return (
                <div
                  key={i}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragging.current = true;
                    setFrom({ c, r });
                    setTo({ c, r });
                  }}
                  onPointerEnter={() => {
                    if (dragging.current) setTo({ c, r });
                  }}
                  className={cn(
                    "border border-white/25",
                    inSel ? "bg-primary/40" : "bg-white/5 hover:bg-white/20",
                  )}
                />
              );
            })}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
