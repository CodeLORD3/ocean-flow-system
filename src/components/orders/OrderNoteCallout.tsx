import { cn } from "@/lib/utils";

/** Butikens anteckning på en order — stor och tydlig så den aldrig missas vid packning. */
export function OrderNoteCallout({ note, className }: { note?: string | null; className?: string }) {
  const text = (note || "").trim();
  if (!text) return null;
  return (
    <div
      role="note"
      className={cn(
        "rounded-xl border-2 border-warning/60 bg-warning/15 px-4 py-3 text-foreground shadow-sm",
        className,
      )}
    >
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-warning-foreground">
        📝 Anteckning från butiken
      </div>
      <p className="whitespace-pre-wrap break-words text-[17px] font-medium leading-snug sm:text-base">{text}</p>
    </div>
  );
}

/** Radens anteckning som fulltext under produktnamnet. */
export function LineNoteText({ note, className }: { note?: string | null; className?: string }) {
  const text = (note || "").trim();
  if (!text) return null;
  return (
    <div
      className={cn(
        "mt-1 whitespace-pre-wrap break-words rounded-md border-l-4 border-warning bg-warning/10 px-2 py-1 text-[15px] font-medium leading-snug text-foreground",
        className,
      )}
    >
      📝 {text}
    </div>
  );
}

export const hasOrderNote = (order: any) => !!(order?.notes || "").trim();
export const lineNoteCount = (order: any) =>
  (order?.shop_order_lines || []).filter((l: any) => (l.priority_note || "").trim()).length;

/** Märke för ihopfälld orderrad: syns bara om ordern eller någon rad har anteckning. */
export function OrderNoteMarker({ order, className }: { order: any; className?: string }) {
  const own = hasOrderNote(order);
  const lines = lineNoteCount(order);
  if (!own && !lines) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-warning/60 bg-warning/20 px-1.5 py-0.5 text-[11px] font-bold text-warning-foreground",
        className,
      )}
      title={own ? order.notes : `${lines} rader har anteckning`}
    >
      📝 Anteckning{lines > 0 ? ` · ${lines} ${lines === 1 ? "rad" : "rader"}` : ""}
    </span>
  );
}

export const escapeHtml = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
