import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Truck, Factory, Warehouse, Store, ShoppingBasket, Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { LEVEL_DESCRIPTION, LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { grossistlagerId, tillverkningslagerId } from "@/lib/locations";
import { lotBalancesAtLocation, transferStock } from "@/lib/stockLedger";
import { useTransferOrders, INCOMING_STATUSES } from "@/hooks/useTransferOrders";
import StockMap from "@/components/inventory/StockMap";

interface StockTreeProps {
  /** Rader från product_stock_locations med storage_locations + products. */
  stock: any[];
  stores: { id: string; name: string }[];
  /** Visa lagervärde (grossist/admin ser kostnader). */
  showValue?: boolean;
  /** Klick på nod filtrerar även den vanliga tabellen på nivån. */
  onFocusLevel?: (level: LocationLevel) => void;
  /** Grossistpersonal kan flytta rader från inköpslagret. */
  canMove?: boolean;
}


type Node = {
  key: string;
  level: LocationLevel;
  title: string;
  subtitle: string;
  storeId?: string | null;
  rows: any[];
};

import { stockQtyToKg, unitLabel } from "@/lib/units";
const kg = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const money = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;

const qtyOf = (r: any) => Number(r.quantity) || 0;
/** Kvantitet med produktens egen enhet — st visas som st, aldrig som kg. */
const qtyLabel = (r: any) => {
  const u = unitLabel(r.products);
  const v = qtyOf(r);
  return `${v.toLocaleString("sv-SE", {
    minimumFractionDigits: u === "st" ? 0 : 1,
    maximumFractionDigits: u === "st" ? 0 : 1,
  })} ${u}`;
};
/** Vikten i kilo för aggregat — värdering använder aldrig detta. */
const kgOf = (r: any) => stockQtyToKg(qtyOf(r), r.products) ?? qtyOf(r);
const valueOf = (r: any) =>
  qtyOf(r) * (Number(r.unit_cost) || 0);

const LEVEL_ICON: Record<LocationLevel, any> = {
  inkopslager: ShoppingBasket,
  grossistlager: Warehouse,
  tillverkningslager: Factory,
  leveranslager: Truck,
  butik: Store,
};

/**
 * Lagerträd för grossist- och adminportalen. Följer flödet uppifrån och ned:
 * inköpslager → grossist/produktion → transportlager → butikslager.
 * Varje nod är klickbar och fäller ut sitt lagerinnehåll.
 */
export default function StockTree({ stock, stores, showValue = true, onFocusLevel, canMove = true }: StockTreeProps) {
  const [open, setOpen] = useState<string | null>(null);
  /** Vald enhet på lagerkartan (ersätter butiksrutorna). */
  const [mapStore, setMapStore] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [moving, setMoving] = useState<null | "grossistlager" | "tillverkningslager">(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Antal rader som dras just nu (null = inget drag pågår). */
  const [dragging, setDragging] = useState<number | null>(null);

  /** Rader som följer med det pågående draget (alla ibockade rader). */
  const dragRowsRef = useRef<any[] | null>(null);
  /** Enhetspanelen under kartan — rullas fram när man väljer en butik. */
  const storeDetailsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mapStore) return;
    const t = window.setTimeout(
      () => storeDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );
    return () => window.clearTimeout(t);
  }, [mapStore]);

  /** Stänger enhetspanelen och rullar tillbaka till kartan. */
  const mapRef = useRef<HTMLDivElement | null>(null);
  const closeStore = () => {
    setMapStore(null);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Esc stänger det som är öppet — panelen först, annars utfälld nod. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mapStore) closeStore();
      else if (open) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapStore, open]);

  const qc = useQueryClient();

  const { data: transfers = [] } = useTransferOrders();


  const storeName = useMemo(() => {
    const m: Record<string, string> = {};
    stores.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stores]);

  const byLevel = useMemo(() => {
    const out: Record<string, any[]> = {};
    (stock || []).forEach((s: any) => {
      const lvl = s.storage_locations?.location_type as LocationLevel | undefined;
      if (!lvl) return;
      (out[lvl] ||= []).push(s);
    });
    return out;
  }, [stock]);

  const rowsForStore = (lvl: LocationLevel, storeId: string) =>
    (byLevel[lvl] || []).filter((s: any) => s.storage_locations?.store_id === storeId);

  const activeTransfers = useMemo(
    () => (transfers as any[]).filter((t) => INCOMING_STATUSES.includes(t.status)),
    [transfers],
  );

  const node = (level: LocationLevel, key: string, title: string, rows: any[], subtitle?: string): Node => ({
    key,
    level,
    title,
    subtitle: subtitle ?? LEVEL_DESCRIPTION[level],
    rows,
  });

  const toggle = (n: Node) => {
    setOpen((cur) => (cur === n.key ? null : n.key));
    onFocusLevel?.(n.level);
  };

  const purchaseRows = byLevel["inkopslager"] || [];
  const selectedRows = useMemo(
    () => purchaseRows.filter((r: any) => selected[r.id] && qtyOf(r) > 0),
    [purchaseRows, selected],
  );

  /**
   * Flyttar valda rader till grossist- eller tillverkningslagret.
   * `rows` anges vid drag-och-släpp (alla ibockade rader följer med).
   * Partierna följer med FIFO så spårbarheten hålls intakt.
   */
  const moveTo = async (
    level: "grossistlager" | "tillverkningslager",
    rowsArg?: any[] | "all",
  ) => {
    const rows =
      rowsArg === "all"
        ? purchaseRows.filter((r: any) => qtyOf(r) > 0)
        : rowsArg && rowsArg.length
          ? rowsArg
          : selectedRows;
    if (!rows.length) {
      toast.error("Markera minst en rad med saldo först.");
      return;
    }
    setMoving(level);
    try {
      const target = level === "grossistlager" ? await grossistlagerId() : await tillverkningslagerId();
      let moved = 0;
      for (const row of rows) {
        const productId = row.product_id as string;
        const from = row.location_id as string;
        if (from === target) continue;
        const lots = await lotBalancesAtLocation(productId, from);
        const picks = lots.length
          ? lots.map((l) => ({ lotId: l.lotId, qty: l.quantityKg }))
          : [{ lotId: null as string | null, qty: qtyOf(row) }];
        for (const pick of picks) {
          if (pick.qty <= 0) continue;
          await transferStock({
            productId,
            fromLocationId: from,
            toLocationId: target,
            quantityKg: pick.qty,
            lotId: pick.lotId,
            unitCost: Number(row.avg_cost) || Number(row.unit_cost) || null,
            note: `Flyttat från inköpslager till ${LEVEL_LABEL[level]}`,
          });
          moved += pick.qty;
        }
      }
      setSelected({});
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success(
        `${kg(moved)} från ${rows.length} rad(er) flyttat till ${LEVEL_LABEL[level]}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Flytten kunde inte bokföras.");
    } finally {
      setMoving(null);
    }
  };

  const dropProps = (level: "grossistlager" | "tillverkningslager") =>
    canMove
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(level);
          },
          onDragLeave: () => setDropTarget((cur) => (cur === level ? null : cur)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDropTarget(null);
            // Alla ibockade rader vid dragstart följer med släppet.
            const rows = dragRowsRef.current?.length ? dragRowsRef.current : selectedRows;
            dragRowsRef.current = null;
            void moveTo(level, rows);
          },
        }
      : {};



  const Card = ({
    n,
    className,
    selectable = false,
  }: {
    n: Node;
    className?: string;
    selectable?: boolean;
  }) => {
    const Icon = LEVEL_ICON[n.level];
    const totalQty = n.rows.reduce((a, r) => a + kgOf(r), 0);
    const totalVal = n.rows.reduce((a, r) => a + valueOf(r), 0);
    const isOpen = open === n.key;
    const canSelect = selectable && canMove;
    const rowsWithQty = n.rows.filter((r: any) => qtyOf(r) > 0);
    const allChecked = rowsWithQty.length > 0 && rowsWithQty.every((r: any) => selected[r.id]);
    return (
      <div className={cn("min-w-0", className)}>
        <button
          type="button"
          onClick={() => toggle(n)}
          aria-expanded={isOpen}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-left transition-colors",
            isOpen
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:border-primary/40 hover:bg-muted/60",
          )}
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{n.title}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")}
              aria-hidden
            />
          </span>
          <span className="mt-0.5 block font-mono text-[11px] tabular-nums">
            {kg(totalQty)}
            {showValue && <span className="ml-1 opacity-75">· {money(totalVal)}</span>}
            <span className="ml-1 opacity-60">· {n.rows.length} artiklar</span>
          </span>
          <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{n.subtitle}</span>
        </button>

        {isOpen && (
          <div className="mt-1 rounded-lg border border-border bg-muted/20 p-2">
            {n.rows.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                Inget lager här just nu.
              </p>
            ) : (
              <>
                {canSelect && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!!moving || !selectedRows.length}
                      onClick={() => moveTo("grossistlager")}
                    >
                      {moving === "grossistlager" ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <Warehouse className="mr-1 h-3 w-3" aria-hidden />
                      )}
                      Flytta till grossistlager
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={!!moving || !selectedRows.length}
                      onClick={() => moveTo("tillverkningslager")}
                    >
                      {moving === "tillverkningslager" ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <Factory className="mr-1 h-3 w-3" aria-hidden />
                      )}
                      Flytta till produktionslager
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      disabled={!!moving || !rowsWithQty.length}
                      onClick={() =>
                        setSelected(
                          allChecked
                            ? {}
                            : Object.fromEntries(rowsWithQty.map((r: any) => [r.id, true])),
                        )
                      }
                    >
                      {allChecked ? "Avmarkera alla" : "Markera hela lagret"}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedRows.length
                        ? `${selectedRows.length} rad(er) markerade — dra dem till grossist eller produktion`
                        : "Bocka i rader och dra dem, eller använd knapparna"}
                    </span>
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      {canSelect && <th className="w-6 px-1 py-1" />}
                      <th className="px-1 py-1 text-left font-medium">Artikel</th>
                      <th className="px-1 py-1 text-left font-medium">Plats</th>
                      <th className="px-1 py-1 text-right font-medium">Antal</th>
                      {showValue && <th className="px-1 py-1 text-right font-medium">Värde</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {n.rows
                      .slice()
                      .sort((a, b) => qtyOf(b) - qtyOf(a))
                      .map((r: any) => (
                        <tr
                          key={r.id}
                          className={cn(
                            "border-t border-border/60 transition-opacity",
                            canSelect && selected[r.id] && "bg-primary/10",
                            canSelect && qtyOf(r) > 0 && "cursor-grab",
                            dragging && selected[r.id] && "opacity-40",
                          )}
                          draggable={canSelect && qtyOf(r) > 0}
                          onDragStart={(e) => {
                            // Dra en ibockad rad = dra alla ibockade rader.
                            const isChecked = !!selected[r.id];
                            if (!isChecked) setSelected((cur) => ({ ...cur, [r.id]: true }));
                            const rows = isChecked && selectedRows.length ? selectedRows : [r];
                            dragRowsRef.current = rows;
                            setDragging(rows.length);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", `${rows.length} rader`);
                            // Egen dragbild så det syns att hela markeringen följer med.
                            const totalKg = rows.reduce((a: number, x: any) => a + kgOf(x), 0);
                            const ghost = document.createElement("div");
                            ghost.textContent = `${rows.length} rad${rows.length > 1 ? "er" : ""} · ${kg(totalKg)}`;
                            ghost.style.cssText =
                              "position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;font:600 12px/1.2 system-ui,sans-serif;background:hsl(var(--primary));color:hsl(var(--primary-foreground));box-shadow:0 6px 16px rgba(0,0,0,.35)";
                            document.body.appendChild(ghost);
                            e.dataTransfer.setDragImage(ghost, 10, 10);
                            window.setTimeout(() => ghost.remove(), 0);
                          }}
                          onDragEnd={() => {
                            dragRowsRef.current = null;
                            setDragging(null);
                          }}
                        >

                          {canSelect && (
                            <td className="px-1 py-1">
                              <Checkbox
                                checked={!!selected[r.id]}
                                disabled={qtyOf(r) <= 0}
                                onCheckedChange={(v) =>
                                  setSelected((cur) => ({ ...cur, [r.id]: !!v }))
                                }
                                aria-label={`Markera ${r.products?.name ?? "rad"}`}
                              />
                            </td>
                          )}
                          <td className="px-1 py-1">
                            <span className="block truncate">{r.products?.name ?? "—"}</span>
                          </td>
                          <td className="px-1 py-1 text-muted-foreground">
                            <span className="block truncate">{r.storage_locations?.name ?? "—"}</span>
                          </td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">
                            {qtyLabel(r)}
                          </td>
                          {showValue && (
                            <td className="px-1 py-1 text-right font-mono tabular-nums">
                              {money(valueOf(r))}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
              </>
            )}

          </div>
        )}
      </div>
    );
  };

  const Connector = () => (
    <div className="flex justify-center py-1" aria-hidden>
      <span className="h-4 w-px bg-border" />
    </div>
  );

  /** Sammanfattning för vald enhet på kartan — vikt, värde, nivåer, topplista. */
  const storeSummary = useMemo(() => {
    const rows = mapStore
      ? (stock || []).filter((r: any) => r.storage_locations?.store_id === mapStore && qtyOf(r) > 0)
      : [];
    const levels: Record<string, number> = {};
    let kgSum = 0;
    let valSum = 0;
    rows.forEach((r: any) => {
      const lvl = (r.storage_locations?.location_type as LocationLevel) || "butik";
      const k = kgOf(r);
      kgSum += k;
      valSum += valueOf(r);
      levels[lvl] = (levels[lvl] || 0) + k;
    });
    return {
      kg: kgSum,
      value: valSum,
      articles: rows.length,
      levels: Object.entries(levels).sort((a, b) => b[1] - a[1]),
      top: rows.slice().sort((a: any, b: any) => kgOf(b) - kgOf(a)).slice(0, 5),
      inTransit: mapStore
        ? activeTransfers.filter((t: any) => t.to_location?.store_id === mapStore).length
        : 0,
    };
  }, [mapStore, stock, activeTransfers]);

  const transportStores = useMemo(() => {
    const ids = new Set<string>();
    (byLevel["leveranslager"] || []).forEach((s: any) => {
      if (s.storage_locations?.store_id) ids.add(s.storage_locations.store_id);
    });
    activeTransfers.forEach((t: any) => {
      const sid = t.to_location?.store_id;
      if (sid) ids.add(sid);
    });
    // Visa bara transportlager som innehåller produkter eller har pågående transport
    return [...ids].filter((sid) => {
      const rows = rowsForStore("leveranslager", sid);
      const hasQty = rows.some((r: any) => Number(qtyOf(r)) > 0);
      const hasTransfer = activeTransfers.some((t: any) => t.to_location?.store_id === sid);
      return hasQty || hasTransfer;
    });
  }, [byLevel, activeTransfers, stores]);


  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <p className="mb-2 text-xs font-semibold">Lagerträd — flödet uppifrån och ned</p>

      {/* 1. Inköpslager */}
      <Card
        n={node("inkopslager", "lvl:inkopslager", LEVEL_LABEL.inkopslager, purchaseRows)}
        className="mx-auto max-w-md"
        selectable
      />

      <Connector />

      {/* 2. Grossist + Produktion sida vid sida — även släppzoner för markerade rader */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          {...dropProps("grossistlager")}
          className={cn(
            "relative rounded-lg transition-shadow",
            dragging && "ring-1 ring-dashed ring-primary/40",
            dropTarget === "grossistlager" && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <Card
            n={node("grossistlager", "lvl:grossistlager", LEVEL_LABEL.grossistlager, byLevel["grossistlager"] || [])}
          />
          {dragging ? (
            <span className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center rounded-t-lg bg-primary/90 px-2 py-1 text-[10px] font-semibold text-primary-foreground">
              Släpp här — {dragging} rad{dragging > 1 ? "er" : ""} flyttas hit
            </span>
          ) : null}
        </div>
        <div
          {...dropProps("tillverkningslager")}
          className={cn(
            "relative rounded-lg transition-shadow",
            dragging && "ring-1 ring-dashed ring-primary/40",
            dropTarget === "tillverkningslager" && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <Card
            n={node(
              "tillverkningslager",
              "lvl:tillverkningslager",
              LEVEL_LABEL.tillverkningslager,
              byLevel["tillverkningslager"] || [],
            )}
          />
          {dragging ? (
            <span className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center rounded-t-lg bg-primary/90 px-2 py-1 text-[10px] font-semibold text-primary-foreground">
              Släpp här — {dragging} rad{dragging > 1 ? "er" : ""} flyttas hit
            </span>
          ) : null}
        </div>
      </div>



      <Connector />

      {/* 3. Transportlager per butik + aktiva transporter */}
      <div className="rounded-lg border border-dashed border-border p-2">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
          <Truck className="h-3.5 w-3.5 text-primary" aria-hidden />
          {LEVEL_LABEL.leveranslager} — aktiva transporter per butik
        </p>
        {transportStores.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            Inga transportlager med innehåll eller pågående transport just nu.
          </p>
        ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {transportStores.map((sid) => {
            const rows = rowsForStore("leveranslager", sid);
            const inTransit = activeTransfers.filter((t: any) => t.to_location?.store_id === sid);
            return (
              <Card
                key={sid}
                n={node(
                  "leveranslager",
                  `transport:${sid}`,
                  storeName[sid] ?? "Okänd butik",
                  rows,
                  inTransit.length
                    ? `${inTransit.length} pågående transport${inTransit.length > 1 ? "er" : ""}`
                    : "Inga pågående transporter",
                )}
              />
            );
          })}
        </div>
        )}

      </div>

      <Connector />

      {/* 4. Butikslager — karta i stället för rutor */}
      <div className="rounded-lg border border-dashed border-border p-2">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
          <Store className="h-3.5 w-3.5 text-primary" aria-hidden />
          Butikslager — välj enhet på kartan
        </p>
        <StockMap
          stock={stock}
          showValue={showValue}
          selectedStoreId={mapStore}
          onSelect={setMapStore}
        />
        <div ref={storeDetailsRef} className="scroll-mt-24">
          {mapStore ? (
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <div className="sticky top-14 z-10 -mx-3 -mt-3 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-border bg-card px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Store className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {storeName[mapStore] ?? "Enhet"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => closeStore()}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Stäng (Esc)
                </Button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-[10px] text-muted-foreground">Lagervikt</p>
                  <p className="font-mono text-sm tabular-nums">{kg(storeSummary.kg)}</p>
                </div>
                {showValue && (
                  <div className="rounded-md border border-border bg-muted/20 p-2">
                    <p className="text-[10px] text-muted-foreground">Lagervärde</p>
                    <p className="font-mono text-sm tabular-nums">{money(storeSummary.value)}</p>
                  </div>
                )}
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-[10px] text-muted-foreground">Artiklar</p>
                  <p className="font-mono text-sm tabular-nums">{storeSummary.articles}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-[10px] text-muted-foreground">På väg in</p>
                  <p className="font-mono text-sm tabular-nums">{storeSummary.inTransit}</p>
                </div>
              </div>

              {storeSummary.levels.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {storeSummary.levels.map(([lvl, v]) => (
                    <div key={lvl} className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {LEVEL_LABEL[lvl as LocationLevel] ?? lvl}
                      </span>
                      <span className="font-mono tabular-nums">{kg(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {storeSummary.top.length > 0 && (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="mb-1 text-[10px] font-semibold text-muted-foreground">
                    Största artiklar
                  </p>
                  <div className="space-y-0.5">
                    {storeSummary.top.map((r: any) => (
                      <div key={r.id} className="flex justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate">{r.products?.name ?? "—"}</span>
                        <span className="shrink-0 font-mono tabular-nums">{qtyLabel(r)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2">
                <Card
                  n={node(
                    "butik",
                    `butik:${mapStore}`,
                    "Hela butikslagret",
                    rowsForStore("butik", mapStore),
                    "Butikens eget lager",
                  )}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
