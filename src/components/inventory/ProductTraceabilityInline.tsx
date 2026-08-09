import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Fish, Ship, Anchor } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

/** Spårbarhet för en enskild produkt — rullgardin inne i produktraden i lagret. */
export default function ProductTraceabilityInline({
  productId,
  showCosts = true,
  fmt,
}: {
  productId: string;
  showCosts?: boolean;
  fmt?: (v: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [openLot, setOpenLot] = useState<string | null>(null);

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["product_lots_traceability", productId],
    enabled: open && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, supplier_lot_id, commercial_name, latin_name, species_fao_code, catch_area, fishing_gear, vessel_name, best_before, quantity_kg, unit_cost, status, is_thawed, created_at, suppliers(name)",
        )
        .eq("product_id", productId)
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

  return (
    <div className="rounded-md border border-border/60 bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-primary/5"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Fish className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Spårbarhet</span>
        {open && !isLoading && (
          <span className="text-[11px] text-muted-foreground">
            {lots.length} parti{lots.length === 1 ? "" : "er"}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t px-2.5 py-2 space-y-2">
          {isLoading ? (
            <div className="text-[11px] text-muted-foreground">Laddar partier…</div>
          ) : lots.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              Ingen spårbarhet ännu. Partier med ursprung skapas vid inleverans.
            </div>
          ) : (
            lots.map((lot: any) => {
              const isOpen = openLot === lot.id;
              return (
                <div key={lot.id} className="rounded-md border bg-background">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-primary/5"
                    onClick={() => setOpenLot(isOpen ? null : lot.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="font-mono text-[11px] font-semibold">{lot.lot_number}</span>
                    {lot.is_thawed && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        Tidigare fryst
                      </Badge>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums font-semibold">
                      {nf(Number(lot.quantity_kg) || 0)} kg
                    </span>
                  </button>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 px-2.5 pb-2 text-[11px]">
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
                      {lot.best_before
                        ? format(parseISO(lot.best_before), "d MMM yyyy", { locale: sv })
                        : "–"}
                    </div>
                    {showCosts && (
                      <div>
                        <span className="text-muted-foreground">Inpris: </span>
                        {fmt ? `${fmt(Number(lot.unit_cost) || 0)}/kg` : `${nf(Number(lot.unit_cost) || 0, 2)}/kg`}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Partinr lev: </span>
                      {lot.supplier_lot_id || "–"}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t bg-muted/20 px-2.5 py-2 space-y-1">
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
        </div>
      )}
    </div>
  );
}
