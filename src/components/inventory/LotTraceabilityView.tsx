import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Fish,
  Search,
  Ship,
  Anchor,
  GitBranch,
  History,
  Network,
  Route,
  ChevronDown,
  PackagePlus,
  Warehouse,
  Repeat,
  Truck,
  Store,
  ShoppingBasket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LineageGraphView from "@/components/inventory/LineageGraphView";
import { EmptyState } from "@/components/EmptyState";
import LotDocumentsPanel from "@/components/inventory/LotDocumentsPanel";
import ParasiteFreezePanel from "@/components/inventory/ParasiteFreezePanel";
import BivalvePanel from "@/components/inventory/BivalvePanel";
import LotPricePanel from "@/components/inventory/LotPricePanel";
import LotHistoryView from "@/components/inventory/LotHistoryView";
import ProductNetworkGraph from "@/components/inventory/ProductNetworkGraph";
import { gapBetween, sinceNow, stampSv } from "@/lib/dwell";
import { movementLabel } from "@/hooks/useStockMovements";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  currency?: string;
  /** Butiksläget döljer inköpspris per kilo. */
  showCosts?: boolean;
  /** Åtgärd i det tomma tillståndet. */
  onEmptyAction?: () => void;
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

/** Ett steg i partiets flöde från inköp till slutkund. */
const STEGS = [
  { key: "inkop", label: "Inköp", icon: PackagePlus, types: ["inleverans"] },
  { key: "lager", label: "Lager", icon: Warehouse, types: ["inventering", "justering", "tillverkning_in"] },
  { key: "omvandling", label: "Omvandling", icon: Repeat, types: ["tillverkning_ut"] },
  { key: "overforing", label: "Överföring", icon: Truck, types: ["overforing_ut", "overforing_in"] },
  { key: "butik", label: "Butik", icon: Store, types: ["kundorder", "kundorder_reversering", "retur"] },
  { key: "salt", label: "Sålt / svinn", icon: ShoppingBasket, types: ["forsaljning", "svinn"] },
] as const;

/** Etikettrad i partipasset. */
function Rad({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Utfällbar detaljsektion. */
function Sektion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/50">
        {title}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Spårbarhet: ett parti i fokus med hela flödet från inköp till slutkund. */
export default function LotTraceabilityView({ currency = "SEK", showCosts = true, onEmptyAction }: Props) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"flode" | "graf" | "historik" | "natverk">("flode");

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
    queryKey: ["lot_movements", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity_kg, created_at, note, reference_id, storage_locations(name), staff(first_name, last_name)",
        )
        .eq("lot_id", selectedId!)
        .order("created_at", { ascending: true });
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

  useEffect(() => {
    if (mode !== "flode") return;
    if (!filtered.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((l) => l.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId, mode]);

  const lot = useMemo(() => filtered.find((l) => l.id === selectedId) ?? null, [filtered, selectedId]);

  const saldo = useMemo(
    () =>
      movements.length
        ? movements.reduce((sum, m) => sum + Number(m.quantity_kg || 0), 0)
        : Number(lot?.quantity_kg || 0),
    [movements, lot],
  );

  const steps = useMemo(
    () =>
      STEGS.map((s) => {
        const hits = movements.filter((m) => (s.types as readonly string[]).includes(m.movement_type));
        const kg = hits.reduce((sum, m) => sum + Number(m.quantity_kg || 0), 0);
        return { ...s, count: hits.length, kg, first: hits[0]?.created_at as string | undefined };
      }),
    [movements],
  );

  const modes = [
    { v: "flode", label: "Flöde", icon: Route },
    { v: "graf", label: "Släktträd", icon: GitBranch },
    { v: "historik", label: "Historik", icon: History },
    { v: "natverk", label: "Nätverk", icon: Network },
  ] as const;

  const namn = lot?.products?.name || lot?.commercial_name || "—";
  const varningFrys =
    lot?.parasite_treatment_required &&
    !(lot?.freeze_start && lot?.freeze_end) &&
    !(lot?.exemption_reason && lot?.exemption_source);

  return (
    <div className="space-y-3">
      {/* Ett enda kontrollhuvud: sök + vy */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2 sm:flex-row sm:items-center print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök parti, produkt, leverantör, art, fångstområde eller fartyg"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex shrink-0 gap-1 overflow-hidden rounded-md border border-border bg-muted/40 p-1">
          {modes.map((m) => (
            <Button
              key={m.v}
              variant={mode === m.v ? "default" : "ghost"}
              size="sm"
              className="h-7 flex-1 gap-1.5 px-2.5 text-[11px] font-semibold"
              onClick={() => setMode(m.v as typeof mode)}
            >
              <m.icon className="h-3.5 w-3.5" />
              <span>{m.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {mode === "graf" && <LineageGraphView currency={currency} startLotId={selectedId} />}
      {mode === "historik" && <LotHistoryView currency={currency} />}
      {mode === "natverk" && <ProductNetworkGraph currency={currency} />}

      {mode === "flode" && (
        <>
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

          {!isLoading && filtered.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
              {/* Partilista */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Partier</p>
                  <span className="text-[11px] text-muted-foreground">{filtered.length} st</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto lg:max-h-[620px]">
                  {filtered.map((l) => {
                    const aktiv = l.id === selectedId;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setSelectedId(l.id)}
                        className={`flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors ${
                          aktiv ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {l.products?.name || l.commercial_name || "—"}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{l.lot_number}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs tabular-nums text-foreground">
                            {nf(Number(l.quantity_kg || 0), 1)}
                          </p>
                          {l.best_before && (
                            <p className="font-mono text-[10px] text-muted-foreground">{l.best_before}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Valt parti */}
              {lot && (
                <div className="space-y-3">
                  {/* Passet */}
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Fish className="h-4 w-4 shrink-0 text-primary" />
                          <h3 className="text-base font-semibold text-foreground">{namn}</h3>
                          <Badge variant="secondary" className="text-[10px]">
                            {lot.status}
                          </Badge>
                          {lot.is_thawed && (
                            <Badge variant="outline" className="text-[10px]">
                              Upptinad
                            </Badge>
                          )}
                          {lot.products?.export_documentation_required && (
                            <Badge variant="outline" className="text-[10px]">
                              Exportdokumentation
                            </Badge>
                          )}
                          {varningFrys && (
                            <Badge variant="destructive" className="text-[10px]">
                              Frysbehandling saknas
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {lot.lot_number}
                          {lot.latin_name ? ` · ${lot.latin_name}` : ""}
                          {lot.products?.sku ? ` · ${lot.products.sku}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                          {nf(saldo, 1)} kg
                        </p>
                        {showCosts && lot.unit_cost != null && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {nf(Number(lot.unit_cost), 2)} {currency}/kg
                          </p>
                        )}
                        {showCosts && (lot.price_status || "preliminar") !== "faststalld" && (
                          <p className="text-[10px] font-medium text-amber-500">Preliminärt pris</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-border pt-3 sm:grid-cols-2">
                      <Rad label="Leverantör" value={lot.suppliers?.name} />
                      <Rad label="Lev. parti" value={lot.supplier_lot_id} />
                      <Rad
                        label="Fångstområde"
                        value={
                          lot.catch_area ? (
                            <span className="inline-flex items-center gap-1">
                              <Anchor className="h-3 w-3" /> {lot.catch_area}
                            </span>
                          ) : null
                        }
                      />
                      <Rad label="Redskap" value={lot.fishing_gear} />
                      <Rad
                        label="Fartyg"
                        value={
                          lot.vessel_name ? (
                            <span className="inline-flex items-center gap-1">
                              <Ship className="h-3 w-3" /> {lot.vessel_name}
                            </span>
                          ) : null
                        }
                      />
                      <Rad label="Fiskeresa" value={lot.fishing_trip_id} />
                      <Rad label="Art (FAO)" value={lot.species_fao_code} />
                      <Rad label="Fångstintyg" value={lot.incoming_catch_cert} />
                      <Rad label="Statistikdok" value={lot.statistical_doc} />
                      <Rad label="Plomb" value={lot.seal_number} />
                      <Rad label="Bäst före" value={lot.best_before} />
                      <Rad label="Registrerat" value={stampSv(lot.created_at)} />
                    </div>
                  </div>

                  {/* Flödet */}
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Flödet — inköp till slutkund
                    </p>
                    <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
                      {steps.map((s, i) => {
                        const aktiv = s.count > 0;
                        return (
                          <div key={s.key} className="flex items-center gap-1">
                            <div
                              className={`min-w-[112px] rounded-md border px-2.5 py-2 ${
                                aktiv ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/20"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <s.icon
                                  className={`h-3.5 w-3.5 ${aktiv ? "text-primary" : "text-muted-foreground"}`}
                                />
                                <span
                                  className={`text-[11px] font-semibold ${
                                    aktiv ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {s.label}
                                </span>
                              </div>
                              {aktiv ? (
                                <>
                                  <p className="mt-1 font-mono text-xs tabular-nums text-foreground">
                                    {s.kg > 0 ? "+" : ""}
                                    {nf(s.kg, 1)} kg
                                  </p>
                                  <p className="font-mono text-[10px] text-muted-foreground">
                                    {s.first ? stampSv(s.first) : ""}
                                  </p>
                                </>
                              ) : (
                                <p className="mt-1 text-[10px] text-muted-foreground">Ej ännu</p>
                              )}
                            </div>
                            {i < steps.length - 1 && <div className="h-px w-3 shrink-0 bg-border" />}
                          </div>
                        );
                      })}
                    </div>
                    {movements.length > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Kvar i lager: <span className="font-mono tabular-nums">{nf(saldo, 3)} kg</span> · orörd{" "}
                        {sinceNow(movements[movements.length - 1].created_at)} sedan senaste händelsen
                      </p>
                    )}
                  </div>

                  {/* Rörelser */}
                  <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Händelser
                      </p>
                      <span className="text-[11px] text-muted-foreground">{movements.length} st</span>
                    </div>
                    {movements.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground">Inga rörelser kopplade till partiet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="px-3 py-2 font-semibold">Datum &amp; tid</th>
                              <th className="px-3 py-2 font-semibold">Händelse</th>
                              <th className="px-3 py-2 font-semibold">Lagerplats</th>
                              <th className="px-3 py-2 font-semibold">Av</th>
                              <th className="px-3 py-2 font-semibold">Låg orörd</th>
                              <th className="px-3 py-2 text-right font-semibold">Kg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map((m, i, arr) => (
                              <tr key={m.id} className="border-t border-border/60 hover:bg-muted/30">
                                <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                                  {stampSv(m.created_at)}
                                </td>
                                <td className="px-3 py-1.5 text-foreground">
                                  {movementLabel(m.movement_type)}
                                  {m.note && <span className="block text-[10px] text-muted-foreground">{m.note}</span>}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {m.storage_locations?.name || "—"}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">
                                  {m.staff ? `${m.staff.first_name} ${m.staff.last_name}` : "System"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                                  {i === 0 ? "—" : gapBetween(arr[i - 1].created_at, m.created_at)}
                                  {i === arr.length - 1 ? ` (nu ${sinceNow(m.created_at)})` : ""}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                                    Number(m.quantity_kg) < 0 ? "text-destructive" : "text-foreground"
                                  }`}
                                >
                                  {nf(Number(m.quantity_kg), 3)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Detaljer bakom utfällning */}
                  <div className="space-y-2">
                    {showCosts && (
                      <Sektion title="Pris och faktura">
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
                      </Sektion>
                    )}
                    <Sektion title="Frysbehandling (parasiter)">
                      <ParasiteFreezePanel lotId={lot.id} />
                    </Sektion>
                    <Sektion title="Musslor och ostron">
                      <BivalvePanel lotId={lot.id} />
                    </Sektion>
                    <Sektion title="Dokument">
                      <LotDocumentsPanel lotId={lot.id} />
                    </Sektion>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
