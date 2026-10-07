/** Produktionens klarmarkering av butiksordrar. Flyttar aldrig lager. */
export const INACTIVE_ORDER_STATUSES = ["Skickad", "Levererad", "Klar / Levererad", "Avbruten", "Arkiverad"];
export const CLOSED_LINE_STATUSES = ["Packad", "Skickad", "Levererad", "Klar / Levererad", "Ej tillgänglig"];

export const isActiveOrder = (o: any) => !INACTIVE_ORDER_STATUSES.includes(o?.status);
export const isOpenLine = (l: any) => !CLOSED_LINE_STATUSES.includes(l?.status || "");
export const isProductionLine = (l: any) => !!l?.products?.is_production_item;
export const isProductionDone = (o: any) => !!o?.production_done_at;

export const orderDeliveryDate = (o: any): string =>
  o?.desired_delivery_date || o?.shop_order_lines?.find((l: any) => l.delivery_date)?.delivery_date || o?.created_at?.slice(0, 10) || "";

export const fmtTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

export const fmtDay = (iso: string) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`)) : "Utan datum";

export const fmtQty = (n: number) => {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return v.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
};

export type ProductionBadgeState = "none" | "done" | "missing" | "changed";
export function productionBadgeState(o: any): ProductionBadgeState {
  if (!isProductionDone(o)) return "none";
  if (o.production_changed_after_done) return "changed";
  if ((o.production_missing_count || 0) > 0) return "missing";
  return "done";
}

/** Öppnar ett utskriftsfönster med enkel tabell-HTML. */
export function printHtml(title: string, body: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Barlow,Arial,sans-serif;font-size:12px;margin:12mm;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #999}
table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border-bottom:1px solid #ddd;padding:3px 4px;text-align:left;vertical-align:top;word-wrap:break-word}
.n{text-align:right;font-family:'IBM Plex Mono',monospace}.m{color:#666;font-size:11px}</style></head><body>${body}
<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
