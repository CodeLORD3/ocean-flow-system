import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { movementLabel } from "@/hooks/useStockMovements";

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

const dt = (ts?: string | null) => (ts ? new Date(ts).toLocaleDateString("sv-SE") : "—");

/**
 * Historikläge i Spårbarhet: avslutade/tömda partier och alla lagerrörelser
 * bakåt i tiden, så gamla kedjor kan visas även när lagret är nollställt.
 */
export default function LotHistoryView() {
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lot_history_movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity_kg, created_at, note, reference_type, products(name, sku), storage_locations(name), lots(lot_number, status, catch_area, best_before)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [
        r.products?.name,
        r.products?.sku,
        r.lots?.lot_number,
        r.lots?.catch_area,
        r.storage_locations?.name,
        movementLabel(r.movement_type),
        r.reference_type,
      ]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök produkt, parti, lagerplats eller händelse"
          className="h-9 pl-7 text-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Hämtar historik…</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<History className="h-4 w-4" />}
          title={q.trim() ? "Inget i historiken matchar sökningen" : "Ingen historik ännu"}
          description={
            q.trim()
              ? "Sök på produkt, partinummer, lagerplats eller händelse."
              : "Historiken byggs upp av inleveranser, omvandlingar, överföringar, försäljning, svinn och inventering."
          }
          actionLabel={q.trim() ? "Rensa sökning" : undefined}
          onAction={q.trim() ? () => setQ("") : undefined}
        />
      )}

      {filtered.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="grid grid-cols-[76px_1fr_84px] items-center gap-2 border-b border-border px-2 py-1.5 text-[10px] uppercase text-muted-foreground sm:grid-cols-[92px_1fr_150px_130px_90px]">
              <span>Datum</span>
              <span>Produkt</span>
              <span className="hidden sm:block">Händelse</span>
              <span className="hidden sm:block">Parti / plats</span>
              <span className="text-right">Kg</span>
            </div>
            <div className="divide-y divide-border/50">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[76px_1fr_84px] items-center gap-2 px-2 py-1 text-xs sm:grid-cols-[92px_1fr_150px_130px_90px]"
                >
                  <span className="whitespace-nowrap font-mono tabular-nums text-[11px] text-muted-foreground">
                    {dt(r.created_at)}
                  </span>
                  <span className="min-w-0 truncate text-foreground">
                    {r.products?.name || "—"}
                    <span className="sm:hidden block truncate text-[10px] text-muted-foreground">
                      {movementLabel(r.movement_type)}
                      {r.lots?.lot_number ? ` · ${r.lots.lot_number}` : ""}
                    </span>
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <Badge variant="secondary" className="text-[10px]">
                      {movementLabel(r.movement_type)}
                    </Badge>
                  </span>
                  <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:block">
                    {r.lots?.lot_number || "—"}
                    {r.storage_locations?.name ? ` · ${r.storage_locations.name}` : ""}
                  </span>
                  <span
                    className={`whitespace-nowrap text-right font-mono tabular-nums ${
                      Number(r.quantity_kg) < 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {nf(Number(r.quantity_kg || 0), 1)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
