import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Fish, Search, Ship, Anchor, GitBranch, List, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import LineageGraphView from "@/components/inventory/LineageGraphView";
import { EmptyState } from "@/components/EmptyState";
import LotDocumentsPanel from "@/components/inventory/LotDocumentsPanel";
import ParasiteFreezePanel from "@/components/inventory/ParasiteFreezePanel";
import BivalvePanel from "@/components/inventory/BivalvePanel";
import LotPricePanel from "@/components/inventory/LotPricePanel";
import LotHistoryView from "@/components/inventory/LotHistoryView";
import ProductNetworkGraph from "@/components/inventory/ProductNetworkGraph";
import { Network } from "lucide-react";

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
  const [mode, setMode] = useState<"lista" | "graf" | "historik" | "natverk">("lista");

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["lots_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, supplier_lot_id, commercial_name, latin_name, species_fao_code, catch_area, fishing_gear, vessel_name, best_before, quantity_kg, unit_cost, price_status, preliminary_unit_cost, invoice_number, invoice_date, status, is_thawed, created_at, fishing_trip_id, incoming_catch_cert, statistical_doc, seal_number, parasite_treatment_required, freeze_start, freeze_end, exemption_reason, exemption_source, suppliers(name), products(name, sku, hs_code, export_documentation_required)",
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
      <div className="flex gap-1 print:hidden">
        <Button
          variant={mode === "lista" ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setMode("lista")}
        >
          <List className="h-3.5 w-3.5" /> Lista
        </Button>
        <Button
          variant={mode === "graf" ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setMode("graf")}
        >
          <GitBranch className="h-3.5 w-3.5" /> Graf
        </Button>
        <Button
          variant={mode === "historik" ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setMode("historik")}
        >
          <History className="h-3.5 w-3.5" /> Historik
        </Button>
        <Button
          variant={mode === "natverk" ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setMode("natverk")}
        >
          <Network className="h-3.5 w-3.5" /> Nätverk
        </Button>
      </div>

      {mode === "graf" && <LineageGraphView currency={currency} startLotId={openId} />}
      {mode === "historik" && <LotHistoryView currency={currency} />}
      {mode === "natverk" && <ProductNetworkGraph currency={currency} />}

      {mode === "lista" && (
      <>
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
              <CardContent className="p-2 sm:p-3">
                <button
                  onClick={() => setOpenId(open ? null : lot.id)}
                  className="flex w-full flex-nowrap sm:flex-wrap items-center justify-between gap-2 overflow-hidden text-left"
                >
                  <div className="min-w-0 flex-1 sm:w-auto sm:flex-none">
                    <div className="flex flex-nowrap sm:flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden">
                      <Fish className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground sm:text-xs">{lot.lot_number}</span>
                      <span className="truncate text-xs font-semibold text-foreground sm:w-auto sm:text-sm">
                        {lot.products?.name || lot.commercial_name || "—"}
                      </span>
                      <span className="hidden sm:flex flex-wrap items-center gap-1.5">
                        {lot.is_thawed && <Badge variant="outline" className="text-[10px]">Upptinad</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{lot.status}</Badge>
                        {lot.products?.export_documentation_required && (
                          <Badge variant="outline" className="text-[10px]">Exportdokumentation</Badge>
                        )}
                        {lot.parasite_treatment_required &&
                          !(lot.freeze_start && lot.freeze_end) &&
                          !(lot.exemption_reason && lot.exemption_source) && (
                            <Badge variant="destructive" className="text-[10px]">
                              Frysbehandling saknas
                            </Badge>
                          )}
                      </span>
                    </div>
                    <div className={`mt-1 ${open ? "flex" : "hidden"} sm:flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground`}>
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
                      {lot.fishing_trip_id && <span>Fiskeresa: {lot.fishing_trip_id}</span>}
                      {lot.incoming_catch_cert && <span>Fångstintyg: {lot.incoming_catch_cert}</span>}
                      {lot.statistical_doc && <span>Statistikdok: {lot.statistical_doc}</span>}
                      {lot.seal_number && <span>Plomb: {lot.seal_number}</span>}
                      {lot.best_before && <span>Bäst före: {lot.best_before}</span>}
                    </div>

                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums">
                    <p className="text-xs font-semibold text-foreground sm:text-sm">{nf(Number(lot.quantity_kg || 0), 1)} kg</p>
                    {showCosts && lot.unit_cost != null && (
                      <p className="text-[11px] text-muted-foreground">
                        {nf(Number(lot.unit_cost), 2)} {currency}/kg
                      </p>
                    )}
                    {showCosts && (lot.price_status || "preliminar") !== "faststalld" && (
                      <p className="text-[10px] text-amber-500">Preliminärt pris</p>
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
                    {showCosts && (
                      <div className="mt-3 border-t border-border pt-2">
                        <LotPricePanel
                          lotId={lot.id}
                          lotNumber={lot.lot_number}
                          currency={currency}
                          unitCost={lot.unit_cost}
                          priceStatus={lot.price_status}
                          preliminaryUnitCost={lot.preliminary_unit_cost}
                          invoiceNumber={lot.invoice_number}
                          invoiceDate={lot.invoice_date}
                        />
                      </div>
                    )}
                    <div className="mt-3 border-t border-border pt-2">
                      <ParasiteFreezePanel lotId={lot.id} />
                    </div>
                    <div className="mt-3 border-t border-border pt-2">
                      <BivalvePanel lotId={lot.id} />
                    </div>
                    <div className="mt-3 border-t border-border pt-2">
                      <LotDocumentsPanel lotId={lot.id} />
                    </div>

                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
