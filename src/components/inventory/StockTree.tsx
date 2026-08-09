import { useMemo, useState } from "react";
import { ChevronDown, Truck, Factory, Warehouse, Store, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_DESCRIPTION, LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { useTransferOrders, INCOMING_STATUSES } from "@/hooks/useTransferOrders";

interface StockTreeProps {
  /** Rader från product_stock_locations med storage_locations + products. */
  stock: any[];
  stores: { id: string; name: string }[];
  /** Visa lagervärde (grossist/admin ser kostnader). */
  showValue?: boolean;
  /** Klick på nod filtrerar även den vanliga tabellen på nivån. */
  onFocusLevel?: (level: LocationLevel) => void;
}

type Node = {
  key: string;
  level: LocationLevel;
  title: string;
  subtitle: string;
  storeId?: string | null;
  rows: any[];
};

const kg = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const money = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;

const qtyOf = (r: any) => Number(r.quantity) || 0;
const valueOf = (r: any) =>
  qtyOf(r) * (Number(r.unit_cost) || Number(r.products?.cost_price) || 0);

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
export default function StockTree({ stock, stores, showValue = true, onFocusLevel }: StockTreeProps) {
  const [open, setOpen] = useState<string | null>(null);
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

  const Card = ({ n, className }: { n: Node; className?: string }) => {
    const Icon = LEVEL_ICON[n.level];
    const totalQty = n.rows.reduce((a, r) => a + qtyOf(r), 0);
    const totalVal = n.rows.reduce((a, r) => a + valueOf(r), 0);
    const isOpen = open === n.key;
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
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
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
                        <tr key={r.id} className="border-t border-border/60">
                          <td className="px-1 py-1">
                            <span className="block truncate">{r.products?.name ?? "—"}</span>
                          </td>
                          <td className="px-1 py-1 text-muted-foreground">
                            <span className="block truncate">{r.storage_locations?.name ?? "—"}</span>
                          </td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">
                            {kg(qtyOf(r))}
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
        n={node("inkopslager", "lvl:inkopslager", LEVEL_LABEL.inkopslager, byLevel["inkopslager"] || [])}
        className="mx-auto max-w-md"
      />

      <Connector />

      {/* 2. Grossist + Produktion sida vid sida */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Card
          n={node("grossistlager", "lvl:grossistlager", LEVEL_LABEL.grossistlager, byLevel["grossistlager"] || [])}
        />
        <Card
          n={node(
            "tillverkningslager",
            "lvl:tillverkningslager",
            LEVEL_LABEL.tillverkningslager,
            byLevel["tillverkningslager"] || [],
          )}
        />
      </div>

      <Connector />

      {/* 3. Transportlager per butik + aktiva transporter */}
      <div className="rounded-lg border border-dashed border-border p-2">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
          <Truck className="h-3.5 w-3.5 text-primary" aria-hidden />
          {LEVEL_LABEL.leveranslager} — aktiva transporter per butik
        </p>
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
      </div>

      <Connector />

      {/* 4. Butikslager */}
      <div className="rounded-lg border border-dashed border-border p-2">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
          <Store className="h-3.5 w-3.5 text-primary" aria-hidden />
          Butikslager
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <Card
              key={s.id}
              n={node("butik", `butik:${s.id}`, s.name, rowsForStore("butik", s.id), "Butikens eget lager")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
