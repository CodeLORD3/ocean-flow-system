import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Fish, Search, Ship, Anchor } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import LotDocumentsPanel from "@/components/inventory/LotDocumentsPanel";

interface Props {
  currency?: string;
  /** Butiksläget döljer inköpspris per kilo. */
  showCosts?: boolean;
  /** Åtgärd i det tomma tillståndet. */
  onEmptyAction?: () => void;
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

/** Spårbarhetsvy: partier med kvarvarande kvantitet, ursprung och rörelser. */
export default function LotTraceabilityView({ currency = "SEK", showCosts = true, onEmptyAction }: Props) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["lots_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, supplier_lot_id, commercial_name, latin_name, species_fao_code, catch_area, fishing_gear, vessel_name, best_before, quantity_kg, unit_cost, status, is_thawed, created_at, suppliers(name), products(name, sku)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["lot_movements", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity_kg, created_at, note, storage_locations(name)")
        .eq("lot_id", openId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return lots;
    return lots.filter((l) =>
      [
        l.lot_number,
        l.supplier_lot_id,
        l.commercial_name,
        l.latin_name,
        l.catch_area,
        l.vessel_name,
        l.suppliers?.name,
        l.products?.name,
        l.products?.sku,
      ]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s)),
    );
  }, [lots, q]);

  const remaining = (lot: any, moves: any[]) =>
    moves.reduce((sum, m) => sum + Number(m.quantity_kg || 0), 0) || Number(lot.quantity_kg || 0);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök parti, leverantör, art, fångstområde eller fartyg"
          className="h-9 pl-7 text-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Hämtar partier…</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Fish className="h-4 w-4" />}
          title={q.trim() ? "Inga partier matchar sökningen" : "Inga partier registrerade ännu"}
          description={
            q.trim()
              ? "Sök på partinummer, leverantörsparti, art, fångstområde eller fartyg."
              : "Partier skapas automatiskt när en inköpsrapport bokförs. Bokför en inleverans för att bygga spårbarhetskedjan."
          }
          actionLabel={q.trim() ? "Rensa sökning" : onEmptyAction ? "Till inköpsrapportering" : undefined}
          onAction={q.trim() ? () => setQ("") : onEmptyAction}
        />
      )}

      <div className="space-y-2">
        {filtered.map((lot) => {
          const open = openId === lot.id;
          return (
            <Card key={lot.id} className="shadow-card">
              <CardContent className="p-3">
                <button
                  onClick={() => setOpenId(open ? null : lot.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Fish className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono text-xs text-muted-foreground">{lot.lot_number}</span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {lot.products?.name || lot.commercial_name || "—"}
                      </span>
                      {lot.is_thawed && <Badge variant="outline" className="text-[10px]">Upptinad</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{lot.status}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {lot.suppliers?.name && <span>{lot.suppliers.name}</span>}
                      {lot.supplier_lot_id && <span>Lev. parti: {lot.supplier_lot_id}</span>}
                      {lot.catch_area && (
                        <span className="inline-flex items-center gap-1">
                          <Anchor className="h-3 w-3" /> {lot.catch_area}
                        </span>
                      )}
                      {lot.fishing_gear && <span>{lot.fishing_gear}</span>}
                      {lot.vessel_name && (
                        <span className="inline-flex items-center gap-1">
                          <Ship className="h-3 w-3" /> {lot.vessel_name}
                        </span>
                      )}
                      {lot.best_before && <span>Bäst före: {lot.best_before}</span>}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-sm font-semibold text-foreground">{nf(Number(lot.quantity_kg || 0), 3)} kg</p>
                    {showCosts && lot.unit_cost != null && (
                      <p className="text-[11px] text-muted-foreground">
                        {nf(Number(lot.unit_cost), 2)} {currency}/kg
                      </p>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="mt-3 border-t border-border pt-2">
                    {movements.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Inga rörelser kopplade till partiet.</p>
                    ) : (
                      <>
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          Kvar i lager: {nf(remaining(lot, movements), 3)} kg
                        </p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] uppercase text-muted-foreground">
                              <th className="py-1">Datum</th>
                              <th className="py-1">Typ</th>
                              <th className="py-1">Lagerplats</th>
                              <th className="py-1 text-right">Kg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map((m) => (
                              <tr key={m.id} className="border-t border-border/50">
                                <td className="py-1 text-muted-foreground">
                                  {new Date(m.created_at).toLocaleDateString("sv-SE")}
                                </td>
                                <td className="py-1">{m.movement_type}</td>
                                <td className="py-1 text-muted-foreground">{m.storage_locations?.name || "—"}</td>
                                <td
                                  className={`py-1 text-right font-mono tabular-nums ${
                                    Number(m.quantity_kg) < 0 ? "text-destructive" : "text-foreground"
                                  }`}
                                >
                                  {nf(Number(m.quantity_kg), 3)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
