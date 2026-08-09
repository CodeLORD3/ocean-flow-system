import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/products/ProductThumb";
import { EmptyState } from "@/components/EmptyState";
import { Trash2, Fish, Ship, Anchor, Package, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

export interface ProductStockGroup {
  product_id: string;
  name: string;
  sku: string;
  category: string;
  image_url?: string | null;
  unit?: string | null;
  totalKg: number;
  value?: number;
  lines: any[];
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

/**
 * Produktkort i lagret: information, lagerplatser, spårbarhet och svinnrapportering
 * för en enskild produkt.
 */
export default function ProductStockDialog({
  group,
  open,
  onOpenChange,
  fmt,
  showCosts = true,
  onWaste,
}: {
  group: ProductStockGroup | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fmt: (v: number) => string;
  showCosts?: boolean;
  onWaste?: (group: ProductStockGroup) => void;
}) {
  const [openLot, setOpenLot] = useState<string | null>(null);
  const productId = group?.product_id ?? null;

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["product_lots_traceability", productId],
    enabled: open && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, supplier_lot_id, commercial_name, latin_name, species_fao_code, catch_area, fishing_gear, vessel_name, best_before, quantity_kg, unit_cost, status, is_thawed, created_at, suppliers(name)",
        )
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["product_lot_movements", openLot],
    enabled: !!openLot,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity_kg, created_at, note, storage_locations(name)")
        .eq("lot_id", openLot!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const locName = (l: any) => l?.storage_locations?.name || "Lager";

  const unit = group?.unit || "kg";

  const totalQty = useMemo(
    () => (group?.lines ?? []).reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0),
    [group],
  );

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <ProductThumb src={group.image_url} alt={group.name} className="w-20 h-16 shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="font-heading text-left truncate">{group.name}</DialogTitle>
              <DialogDescription className="text-left">
                <span className="font-mono text-[11px]">SKU: {group.sku}</span>
                {group.category && (
                  <Badge variant="outline" className="ml-2 text-[10px] h-5">
                    {group.category}
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1 gap-1.5">
              <Package className="h-3.5 w-3.5" /> Produkt
            </TabsTrigger>
            <TabsTrigger value="trace" className="flex-1 gap-1.5">
              <Fish className="h-3.5 w-3.5" /> Spårbarhet
            </TabsTrigger>
          </TabsList>

          {/* ── Produkt / lagerplatser ─────────────────────────────── */}
          <TabsContent value="info" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Totalt lager</div>
                <div className="font-mono font-semibold tabular-nums">{nf(group.totalKg)} kg</div>
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Antal ({unit})</div>
                <div className="font-mono font-semibold tabular-nums">{nf(totalQty)}</div>
              </div>
              {showCosts && (
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Lagervärde</div>
                  <div className="font-mono font-semibold tabular-nums">{fmt(group.value || 0)}</div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lagerplatser
              </div>
              {group.lines.map((l: any) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-card px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium">{locName(l)}</span>
                  {l.storage_locations?.stores?.name && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {l.storage_locations.stores.name}
                    </Badge>
                  )}
                  <span className="text-xs tabular-nums font-semibold">
                    {nf(Number(l.quantity) || 0)} {unit}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Ank: {l.arrival_date ? format(parseISO(l.arrival_date), "d MMM", { locale: sv }) : "–"}
                  </span>
                </div>
              ))}
              {group.lines.length === 0 && (
                <div className="text-xs text-muted-foreground">Inget lager registrerat.</div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => onWaste?.(group)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Rapportera svinn
              </Button>
            </div>
          </TabsContent>

          {/* ── Spårbarhet ─────────────────────────────────────────── */}
          <TabsContent value="trace" className="space-y-2 pt-3">
            {isLoading ? (
              <div className="text-xs text-muted-foreground py-6 text-center">Laddar partier…</div>
            ) : lots.length === 0 ? (
              <EmptyState
                icon={<Fish className="h-4 w-4" />}
                title="Ingen spårbarhet ännu"
                description="Partier med ursprung skapas vid inleverans. När produkten tagits emot visas fångstområde, redskap, fartyg och rörelser här."
              />
            ) : (
              lots.map((lot: any) => {
                const isOpen = openLot === lot.id;
                return (
                  <div key={lot.id} className="rounded-md border bg-card">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary/5"
                      onClick={() => setOpenLot(isOpen ? null : lot.id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="font-mono text-xs font-semibold">{lot.lot_number}</span>
                      {lot.is_thawed && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          Tidigare fryst
                        </Badge>
                      )}
                      <span className="ml-auto text-xs tabular-nums font-semibold">
                        {nf(Number(lot.quantity_kg) || 0)} kg
                      </span>
                    </button>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 px-3 pb-2 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Art: </span>
                        {lot.commercial_name || "–"}
                        {lot.latin_name ? ` (${lot.latin_name})` : ""}
                      </div>
                      <div>
                        <span className="text-muted-foreground">FAO: </span>
                        {lot.species_fao_code || "–"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Anchor className="h-3 w-3 text-muted-foreground" />
                        {lot.catch_area || "–"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Redskap: </span>
                        {lot.fishing_gear || "–"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Ship className="h-3 w-3 text-muted-foreground" />
                        {lot.vessel_name || "–"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Leverantör: </span>
                        {lot.suppliers?.name || "–"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bäst före: </span>
                        {lot.best_before ? format(parseISO(lot.best_before), "d MMM yyyy", { locale: sv }) : "–"}
                      </div>
                      {showCosts && (
                        <div>
                          <span className="text-muted-foreground">Inpris: </span>
                          {fmt(Number(lot.unit_cost) || 0)}/kg
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Partinr lev: </span>
                        {lot.supplier_lot_id || "–"}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Lagerrörelser
                        </div>
                        {movements.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Inga rörelser bokförda.</div>
                        ) : (
                          movements.map((m: any) => (
                            <div key={m.id} className="flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground tabular-nums">
                                {format(parseISO(m.created_at), "d MMM HH:mm", { locale: sv })}
                              </span>
                              <Badge variant="outline" className="text-[10px] h-4">
                                {m.movement_type}
                              </Badge>
                              <span className="tabular-nums">{nf(Number(m.quantity_kg) || 0)} kg</span>
                              <span className="text-muted-foreground truncate">
                                {m.storage_locations?.name || ""} {m.note ? `· ${m.note}` : ""}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
