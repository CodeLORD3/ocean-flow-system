import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, X, Trash2, Pause } from "lucide-react";
import { usePosProducts, type PosProduct } from "../hooks/usePosProducts";
import { useCart, computeTotals, selectActiveTab, type CartLineOrigin } from "../store/cart";
import { useCashier } from "../store/cashier";
import { formatSek } from "../lib/money";
import WeightDialog from "../components/WeightDialog";
import PaymentDialog from "../components/PaymentDialog";
import OriginChip from "../components/OriginChip";
import TraceabilityModal from "../components/TraceabilityModal";
import { scomberClient } from "../adapters/scomberClient";

const CATEGORY_ORDER = ["Färsk fisk", "Skaldjur", "Rökt & gravat", "Delikatess", "Torrvaror"];

export default function PosRegister() {
  const cashier = useCashier((s) => s.cashier);
  const nav = useNavigate();
  const { data: products = [], isLoading } = usePosProducts(cashier?.store_id);

  const [activeCat, setActiveCat] = useState<string>(CATEGORY_ORDER[0]);
  const [search, setSearch] = useState("");
  const [weightProduct, setWeightProduct] = useState<PosProduct | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [traceFor, setTraceFor] = useState<{ sku: string; name: string } | null>(null);

  const { tabs, activeTabId, switchTab, newTab, removeTab, addLine, removeLine, clear } = useCart();
  const activeTab = useCart(selectActiveTab);
  const lines = activeTab?.lines ?? [];
  const { totalOre, vatBreakdown } = useMemo(() => computeTotals(lines), [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
        );
      }
      return p.category === activeCat;
    });
  }, [products, search, activeCat]);

  /**
   * Hämtar äldsta aktiva batchen via traceability-edge så vi kan visa ursprung
   * direkt på cart-raden. Tyst fail om backend inte svarar — raden läggs till ändå.
   */
  const fetchOriginForSku = async (sku: string): Promise<CartLineOrigin | null> => {
    try {
      const res = await scomberClient.traceability({ sku, store_id: cashier?.store_id ?? null });
      const oldest = res.batches?.[0];
      if (!oldest) return null;
      const raw = (oldest.raw ?? {}) as Record<string, unknown>;
      return {
        batch_id: oldest.batch_id,
        country: typeof raw.country_of_origin === "string" ? raw.country_of_origin : null,
        caught_at: oldest.caught_at,
        vessel: typeof raw.vessel === "string" ? raw.vessel : null,
        msc: raw.msc_certified === true,
      };
    } catch (e) {
      console.warn("traceability lookup failed", e);
      return null;
    }
  };

  const onTileClick = async (p: PosProduct) => {
    if (p.unit_type === "kg") {
      setWeightProduct(p);
      return;
    }
    const origin = await fetchOriginForSku(p.sku);
    addLine({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit_type,
      quantity: 1,
      unit_price_ore: p.price_ore,
      vat_rate: Number(p.vat_rate),
      origin,
    });
  };

  const park = async () => {
    if (!activeTab || lines.length === 0) return;
    newTab();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3 p-3 h-[calc(100vh-3.5rem)]">
      {/* LEFT: catalog */}
      <section className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-[var(--pos-shadow-sm)]">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Sök produkt eller skanna streckkod…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
        </div>

        <div className="px-3 pt-3 flex gap-2 flex-wrap">
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => {
                setActiveCat(c);
                setSearch("");
              }}
              className={`px-3 h-9 rounded-md text-sm font-medium border transition ${
                activeCat === c && !search
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-transparent hover:border-border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 p-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Laddar produkter…</div>
          ) : products.length === 0 ? (
            <div className="text-sm text-muted-foreground p-6 text-center">
              Inga produkter i lager för {cashier?.store_name ?? "denna butik"}.
              <div className="text-[11px] mt-1">
                Kontrollera lagersaldon i ERP:n innan försäljning.
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              Inga produkter matchade
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onTileClick(p)}
                  className="pos-tile flex flex-col justify-between p-3 rounded-lg border border-border bg-background hover:border-primary text-left"
                >
                  <div>
                    <div className="text-sm font-semibold leading-tight text-foreground">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{p.sku}</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-base font-semibold tabular text-primary">
                      {formatSek(p.price_ore)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.unit_type === "kg" ? "/kg" : "/st"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </section>

      {/* RIGHT: cart */}
      <section className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-[var(--pos-shadow-sm)]">
        {/* Tabs */}
        <div className="px-2 pt-2 flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`group flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t-md ${
                t.id === activeTabId
                  ? "bg-background text-foreground border-x border-t border-border -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.lines.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] tabular">
                  {t.lines.length}
                </span>
              )}
              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(t.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => newTab()}
            className="ml-auto px-2 text-muted-foreground hover:text-foreground"
            title="Ny kund"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Lines */}
        <ScrollArea className="flex-1 p-3">
          {lines.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Tryck på en produkt för att börja
            </div>
          ) : (
            <ul className="space-y-1">
              {lines.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start justify-between gap-2 p-2 rounded-md hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular">
                      {l.unit === "kg"
                        ? `${l.quantity.toLocaleString("sv-SE", { maximumFractionDigits: 3 })} kg × ${formatSek(l.unit_price_ore)}`
                        : `${l.quantity} st × ${formatSek(l.unit_price_ore)}`}
                    </div>
                    <div className="mt-1">
                      <OriginChip
                        origin={l.origin ?? null}
                        onClick={() => setTraceFor({ sku: l.sku, name: l.name })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular">{formatSek(l.line_total_ore)}</span>
                    <button
                      onClick={() => removeLine(l.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {/* Totals */}
        <div className="border-t border-border p-3 space-y-2 bg-muted/30">
          {vatBreakdown.length > 0 && (
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {vatBreakdown.map((v) => (
                <div key={v.rate} className="flex justify-between tabular">
                  <span>Moms {v.rate}%</span>
                  <span>{formatSek(v.vat)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Totalt</span>
            <span className="text-2xl font-semibold tabular text-primary">
              {formatSek(totalOre)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={park} disabled={lines.length === 0}>
              <Pause className="h-3.5 w-3.5 mr-1" /> Parkera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clear()}
              disabled={lines.length === 0}
            >
              Avbryt
            </Button>
            <Button variant="outline" size="sm" onClick={() => nav("/pos/shift")}>
              Skift
            </Button>
          </div>
          <Button
            className="w-full h-12 text-base"
            onClick={() => setShowPay(true)}
            disabled={lines.length === 0 || !cashier?.shift_id}
          >
            Betala
          </Button>
        </div>
      </section>

      {weightProduct && (
        <WeightDialog
          product={weightProduct}
          onClose={() => setWeightProduct(null)}
          onConfirm={(grams) => {
            const kg = grams / 1000;
            addLine({
              product_id: weightProduct.id,
              sku: weightProduct.sku,
              name: weightProduct.name,
              unit: "kg",
              quantity: kg,
              unit_price_ore: weightProduct.price_ore,
              vat_rate: Number(weightProduct.vat_rate),
            });
            setWeightProduct(null);
          }}
        />
      )}

      {showPay && activeTab && (
        <PaymentDialog
          totalOre={totalOre}
          lines={lines}
          vatBreakdown={vatBreakdown}
          onClose={() => setShowPay(false)}
        />
      )}

      <TraceabilityModal
        open={!!traceFor}
        sku={traceFor?.sku ?? null}
        productName={traceFor?.name ?? ""}
        storeId={cashier?.store_id ?? null}
        onClose={() => setTraceFor(null)}
      />
    </div>
  );
}
