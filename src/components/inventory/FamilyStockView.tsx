import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, RefreshCw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/products/ProductThumb";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import {
  buildFamilyGroups,
  forecastFor,
  packLabel,
  type FamilyGroup,
  type FamilyProduct,
} from "@/lib/productFamilies";

interface Props {
  /** Alla produkter i registret (behöver family_id + weight_per_piece). */
  products: FamilyProduct[];
  families: { id: string; name: string; base_unit?: string | null }[];
  /** Lagersaldo per produkt i produktens egen enhet. */
  stockByProduct: Map<string, number>;
  /** Kvar att packa på kundbeställningar per produkt. */
  orderedByProduct?: Map<string, number>;
  search?: string;
  category?: string;
  /** Öppnar omvandlingsflödet med källprodukten förvald. */
  onTransform?: (productId: string, targetProductId?: string) => void;
}

const nf = (n: number, d = 1) => n.toLocaleString("sv-SE", { maximumFractionDigits: d });

/**
 * Lagret grupperat per produktfamilj: en rad per familj med totalen i kg, och
 * expanderbart per förpackning med omvandlingsprognos och beställningsflagga.
 * Vyn läser bara — lager ändras först i omvandlingsflödet.
 */
export default function FamilyStockView({
  products,
  families,
  stockByProduct,
  orderedByProduct,
  search = "",
  category = "__all__",
  onTransform,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const groups = useMemo(
    () => buildFamilyGroups({ products, families, stockByProduct, orderedByProduct }),
    [products, families, stockByProduct, orderedByProduct],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (category !== "__all__" && g.category !== category) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.variants.some((v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
      );
    });
  }, [groups, search, category]);

  if (groups.length === 0) {
    return (
      <Card className="shadow-card">
        <EmptyState
          bare
          icon={<Layers className="h-4 w-4" />}
          title="Inga produktfamiljer ännu"
          description="Koppla ihop varianter av samma vara under Produkter — fältet 'Del av produktfamilj' på produkten. Ange också nettovikt per styck, så kan totalen räknas i kilo."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.length === 0 && (
        <Card className="shadow-card">
          <EmptyState
            bare
            icon={<Layers className="h-4 w-4" />}
            title="Ingen familj matchar filtret"
            description="Rensa sökningen eller välj en annan kategori."
          />
        </Card>
      )}
      {filtered.map((g) => {
        const isOpen = open.has(g.familyId);
        return (
          <Card key={g.familyId} className="overflow-hidden shadow-card">
            <button
              type="button"
              onClick={() => toggle(g.familyId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Layers className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{g.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {g.variants.length} förpackning{g.variants.length === 1 ? "" : "ar"} · {g.category}
                  {g.unknownCount > 0 && ` · ${g.unknownCount} utan nettovikt`}
                </div>
              </div>
              {g.shortfalls.length > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-600">
                  <TriangleAlert className="h-3 w-3" /> {g.shortfalls.length}
                </Badge>
              )}
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-bold tabular-nums">
                  {nf(g.totalKg)} {g.baseUnit}
                </div>
                <div className="text-[10px] text-muted-foreground">totalt</div>
              </div>
            </button>

            {isOpen && (
              <div className="space-y-2 border-t bg-muted/20 p-2">
                {g.shortfalls.map((s) => (
                  <div
                    key={`sf-${s.variant.productId}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2"
                  >
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1 text-[11px] font-medium">{s.label}</span>
                    {onTransform && (
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => onTransform(s.sourceProductId, s.variant.productId)}
                      >
                        <RefreshCw className="h-3 w-3" /> Omvandla
                      </Button>
                    )}
                  </div>
                ))}

                {g.variants.map((v) => {
                  const forecasts = forecastFor(v, g as FamilyGroup);
                  return (
                    <div key={v.productId} className="rounded-md border border-border/60 bg-card p-2.5">
                      <div className="flex items-center gap-2.5">
                        <ProductThumb
                          src={v.image_url}
                          alt={v.name}
                          productId={v.productId}
                          className="hidden h-7 w-9 sm:block"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{v.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {v.isPiece
                              ? v.contentKg
                                ? `${packLabel(v.contentKg)} per styck`
                                : "nettovikt per styck saknas"
                              : "löpande vikt"}
                            {v.ordered > 0 && ` · beställt ${nf(v.ordered)} ${v.unit}`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-xs font-semibold tabular-nums">
                            {nf(v.qty, v.isPiece ? 0 : 1)} {v.unit}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {v.qtyKg === null ? "– kg" : `${nf(v.qtyKg)} kg`}
                          </div>
                        </div>
                        {onTransform && v.qty > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[10px]"
                            onClick={() => onTransform(v.productId)}
                          >
                            <RefreshCw className="h-3 w-3" /> Omvandla
                          </Button>
                        )}
                      </div>

                      {forecasts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                          {forecasts.map((f) => (
                            <button
                              key={f.targetProductId}
                              type="button"
                              disabled={!onTransform}
                              onClick={() => onTransform?.(v.productId, f.targetProductId)}
                              className={cn(
                                "rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-left text-[10px]",
                                onTransform && "hover:border-primary/50 hover:bg-primary/5",
                              )}
                            >
                              <span className="font-medium">{f.label}</span>
                              {v.qty > 0 && (
                                <span className="block text-muted-foreground tabular-nums">
                                  hela lagret ≈ {f.fromStock} st {f.targetName}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
