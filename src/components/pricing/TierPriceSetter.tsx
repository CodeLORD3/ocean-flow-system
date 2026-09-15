import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock, Unlock, TrendingUp, AlertTriangle, Copy, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveCost, COST_SOURCE_LABEL } from "@/lib/effectiveCost";
import {
  usePriceTiers,
  useCurrentTierPrices,
  useProductCostHistory,
  useSetTierPrice,
  useTierPriceHistory,
  margin,
  priceFromMargin,
  fmt,
  type PriceTier,
} from "@/hooks/usePriceTiers";

interface Props {
  product: any;
  /** Partiet priset sattes utifrån, när rutan öppnas från en inleverans. */
  sourceLotId?: string | null;
  /** Inköpspris från just den inleveransen — annars produktens gällande pris. */
  incomingCost?: number | null;
  setBy?: string | null;
}

interface Draft {
  price: string;
  lockMode: "locked" | "estimated";
  retailMargin: string;
}

const DEFAULT_WHOLESALE_MARGIN = 22;
const DEFAULT_RETAIL_MARGIN = 35;

/**
 * Sätter grossistpris per priskategori direkt när varan levererats in.
 * Visar inköpspris nu och tidigare, marginal i kronor och procent samt
 * vad butiken behöver ta ut mot privatkund för att täcka sin marginal.
 */
export default function TierPriceSetter({ product, sourceLotId, incomingCost, setBy }: Props) {
  const { data: tiers = [] } = usePriceTiers();
  const { data: current } = useCurrentTierPrices(product?.id ? [product.id] : []);
  const { data: history } = useProductCostHistory(product?.id);
  const { data: priceLog = [] } = useTierPriceHistory(product?.id);
  const setPrice = useSetTierPrice();
  const [showLog, setShowLog] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const eff = effectiveCost(product);
  const cost = Number(incomingCost ?? 0) > 0 ? Number(incomingCost) : eff.value;
  const costLabel =
    Number(incomingCost ?? 0) > 0 ? "Inköpspris denna leverans" : COST_SOURCE_LABEL[eff.source];

  const prevRetail = Number(product?.retail_suggested ?? 0);

  useEffect(() => {
    if (!tiers.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of tiers) {
        if (next[t.id]) continue;
        const existing = current?.get(`${product.id}:${t.id}`);
        const suggested = existing
          ? Number(existing.price)
          : priceFromMargin(cost, DEFAULT_WHOLESALE_MARGIN);
        next[t.id] = {
          price: suggested ? String(suggested) : "",
          lockMode: existing?.lock_mode ?? "estimated",
          retailMargin: String(
            existing?.retail_suggested && suggested
              ? Math.max(0, Math.round(margin(suggested, Number(existing.retail_suggested))))
              : DEFAULT_RETAIL_MARGIN,
          ),
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers.length, product?.id, cost, current]);

  const rows = useMemo(
    () =>
      tiers.map((t) => {
        const d = drafts[t.id] ?? { price: "", lockMode: "estimated" as const, retailMargin: String(DEFAULT_RETAIL_MARGIN) };
        const price = Number(String(d.price).replace(",", "."));
        const retailMarginPct = Number(String(d.retailMargin).replace(",", ".")) || 0;
        const retailExVat = price > 0 ? priceFromMargin(price, retailMarginPct) : 0;
        const retailIncVat = retailExVat * (1 + Number(t.vat_rate) / 100);
        const existing = current?.get(`${product.id}:${t.id}`);
        return {
          tier: t,
          draft: d,
          price,
          gross: price > 0 ? price - cost : 0,
          marginPct: price > 0 ? margin(cost, price) : 0,
          retailExVat,
          retailIncVat,
          existing,
          /** Butiken kan inte ta ut mer än marknaden — flagga tydligt över tidigare utpris. */
          retailWarning: prevRetail > 0 && retailIncVat > prevRetail * 1.15,
        };
      }),
    [tiers, drafts, cost, current, product?.id, prevRetail],
  );

  const patch = (tierId: string, part: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [tierId]: { ...prev[tierId], ...part } as Draft }));

  const copyToAll = (fromTierId: string) => {
    const src = drafts[fromTierId];
    if (!src) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of tiers) next[t.id] = { ...next[t.id], price: src.price };
      return next;
    });
    toast.success("Samma pris satt på alla priskategorier");
  };

  const saveTier = async (row: (typeof rows)[number]) => {
    if (!(row.price > 0)) {
      toast.error("Ange ett pris större än noll");
      return;
    }
    try {
      await setPrice.mutateAsync({
        product_id: product.id,
        price_tier_id: row.tier.id,
        price: row.price,
        currency: row.tier.currency,
        lock_mode: row.draft.lockMode,
        basis_cost: cost || null,
        margin_pct: row.marginPct,
        retail_suggested: row.retailExVat || null,
        source_lot_id: sourceLotId ?? null,
        set_by: setBy ?? null,
      });
      toast.success(`${row.tier.name}: ${fmt(row.price)} ${row.tier.currency}/kg sparat`);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara priset");
    }
  };

  const saveAll = async () => {
    for (const row of rows) if (row.price > 0) await saveTier(row);
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-primary" /> Sätt pris till butikerna
          </span>
          <Badge variant="outline" className="text-[10px]">
            {costLabel} {fmt(cost)} kr/kg
          </Badge>
          {history?.last_cost != null && (
            <span className="text-muted-foreground">
              Senaste inköp {fmt(Number(history.last_cost))} kr
              {history.avg_cost_30d != null && <> · snitt 30 d {fmt(Number(history.avg_cost_30d))} kr</>}
              {history.min_cost_90d != null && history.max_cost_90d != null && (
                <> · 90 d {fmt(Number(history.min_cost_90d))}–{fmt(Number(history.max_cost_90d))} kr</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setShowLog((v) => !v)}>
            <History className="mr-1 h-3 w-3" /> Historik
          </Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={saveAll} disabled={setPrice.isPending}>
            Spara alla
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-1 text-left font-medium">Priskategori</th>
              <th className="pb-1 text-right font-medium">Pris/kg</th>
              <th className="pb-1 text-right font-medium">Vinst/kg</th>
              <th className="pb-1 text-right font-medium">Marginal</th>
              <th className="pb-1 text-right font-medium">Butikens marginal</th>
              <th className="pb-1 text-right font-medium">Utpris inkl. moms</th>
              <th className="pb-1 text-center font-medium">Status</th>
              <th className="pb-1 text-right font-medium">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tier.id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5">
                  <div className="font-medium text-foreground">{row.tier.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {row.tier.currency} · moms {fmt(Number(row.tier.vat_rate), 1)} %
                  </div>
                </td>
                <td className="py-1.5 text-right">
                  <Input
                    value={row.draft.price}
                    onChange={(e) => patch(row.tier.id, { price: e.target.value })}
                    inputMode="decimal"
                    onFocus={(e) => e.currentTarget.select()}
                    className="ml-auto h-7 w-24 text-right font-mono tabular-nums"
                  />
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                  {row.price > 0 ? `${fmt(row.gross)} kr` : "–"}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right font-mono tabular-nums font-medium",
                    row.marginPct >= 20 ? "text-success" : row.marginPct > 0 ? "text-warning" : "text-destructive",
                  )}
                >
                  {row.price > 0 ? `${fmt(row.marginPct, 1)} %` : "–"}
                </td>
                <td className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Input
                      value={row.draft.retailMargin}
                      onChange={(e) => patch(row.tier.id, { retailMargin: e.target.value })}
                      inputMode="decimal"
                      onFocus={(e) => e.currentTarget.select()}
                      className="h-7 w-16 text-right font-mono tabular-nums"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </td>
                <td className="py-1.5 text-right">
                  <div className="font-mono tabular-nums text-foreground">
                    {row.retailIncVat > 0 ? `${fmt(row.retailIncVat)} ${row.tier.currency}` : "–"}
                  </div>
                  {row.retailWarning && (
                    <div className="inline-flex items-center gap-1 text-[10px] text-warning">
                      <AlertTriangle className="h-3 w-3" /> över tidigare utpris {fmt(prevRetail)}
                    </div>
                  )}
                </td>
                <td className="py-1.5 text-center">
                  <Button
                    variant={row.draft.lockMode === "locked" ? "secondary" : "outline"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      patch(row.tier.id, { lockMode: row.draft.lockMode === "locked" ? "estimated" : "locked" })
                    }
                  >
                    {row.draft.lockMode === "locked" ? (
                      <><Lock className="mr-1 h-3 w-3" /> Låst</>
                    ) : (
                      <><Unlock className="mr-1 h-3 w-3" /> Uppskattat</>
                    )}
                  </Button>
                </td>
                <td className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Sätt samma pris på alla priskategorier"
                      onClick={() => copyToAll(row.tier.id)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => saveTier(row)} disabled={setPrice.isPending}>
                      Spara
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLog && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          {priceLog.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Inga tidigare priser satta på denna produkt.</p>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium">Datum</th>
                  <th className="text-left font-medium">Priskategori</th>
                  <th className="text-right font-medium">Pris</th>
                  <th className="text-right font-medium">Inköp</th>
                  <th className="text-right font-medium">Marginal</th>
                  <th className="text-left font-medium">Status</th>
                  <th className="text-left font-medium">Satt av</th>
                </tr>
              </thead>
              <tbody>
                {priceLog.map((h) => (
                  <tr key={h.id} className="border-t border-border/50">
                    <td className="py-1">{new Date(h.valid_from).toLocaleString("sv-SE").slice(0, 16)}</td>
                    <td className="py-1">{tiers.find((t) => t.id === h.price_tier_id)?.name ?? "–"}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{fmt(Number(h.price))} {h.currency}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{h.basis_cost != null ? fmt(Number(h.basis_cost)) : "–"}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{h.margin_pct != null ? `${fmt(Number(h.margin_pct), 1)} %` : "–"}</td>
                    <td className="py-1">{h.lock_mode === "locked" ? "Låst" : "Uppskattat"}</td>
                    <td className="py-1">{h.set_by || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
