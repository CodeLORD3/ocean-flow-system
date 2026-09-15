import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ChevronRight,
  ArrowLeft,
  PackagePlus,
  Warehouse,
  Repeat,
  Truck,
  Store,
  ShoppingBasket,
} from "lucide-react";

import LineageGraphView from "@/components/inventory/LineageGraphView";
import { EmptyState } from "@/components/EmptyState";
import LotDocumentsPanel from "@/components/inventory/LotDocumentsPanel";
import ParasiteFreezePanel from "@/components/inventory/ParasiteFreezePanel";
import BivalvePanel from "@/components/inventory/BivalvePanel";
import LotPricePanel from "@/components/inventory/LotPricePanel";
import LotHistoryView from "@/components/inventory/LotHistoryView";
import LotChainGraph from "@/components/inventory/LotChainGraph";
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
  { key: "inkop", label: "Inköp", icon: PackagePlus, types: ["inleverans"], color: "text-emerald-600" },
  {
    key: "lager",
    label: "Lager",
    icon: Warehouse,
    types: ["inventering", "justering", "tillverkning_in"],
    color: "text-sky-600",
  },
  { key: "omvandling", label: "Omvandling", icon: Repeat, types: ["tillverkning_ut"], color: "text-violet-600" },
  {
    key: "overforing",
    label: "Överföring",
    icon: Truck,
    types: ["overforing_ut", "overforing_in"],
    color: "text-amber-600",
  },
  {
    key: "butik",
    label: "Butik",
    icon: Store,
    types: ["kundorder", "kundorder_reversering", "retur"],
    color: "text-teal-600",
  },
  { key: "salt", label: "Sålt / svinn", icon: ShoppingBasket, types: ["forsaljning", "svinn"], color: "text-rose-600" },
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

/** Hur många dagar kvar till bäst före, för färgsättning av partierna. */
function dagarKvar(bestBefore?: string | null) {
  if (!bestBefore) return null;
  return Math.ceil((new Date(`${bestBefore}T12:00:00Z`).getTime() - Date.now()) / 86400000);
}

const hallbarhetsFarg = (d: number | null) =>
  d === null
    ? "bg-muted text-muted-foreground"
    : d < 0
      ? "bg-destructive/15 text-destructive"
      : d <= 2
        ? "bg-rose-500/15 text-rose-600"
        : d <= 5
          ? "bg-amber-500/15 text-amber-600"
          : d <= 14
            ? "bg-sky-500/15 text-sky-600"
            : "bg-emerald-500/15 text-emerald-600";

/** Måndag som veckostart, svensk tid. */
function veckoStart(d: Date) {
  const k = new Date(d);
  k.setHours(0, 0, 0, 0);
  const dag = (k.getDay() + 6) % 7;
  k.setDate(k.getDate() - dag);
  return k;
}

/** Grupperar en tidpunkt i Idag / Igår / Denna veckan / Förra veckan / månad. */
function tidsGrupp(iso?: string | null): { key: string; label: string } {
  if (!iso) return { key: "okant", label: "Utan datum" };
  const d = new Date(iso);
  const nu = new Date();
  const idag = new Date(nu);
  idag.setHours(0, 0, 0, 0);
  const dagStart = new Date(d);
  dagStart.setHours(0, 0, 0, 0);
  const diffDagar = Math.round((idag.getTime() - dagStart.getTime()) / 86400000);
  if (diffDagar === 0) return { key: "idag", label: "Idag" };
  if (diffDagar === 1) return { key: "igar", label: "Igår" };
  const v0 = veckoStart(nu);
  const v1 = new Date(v0);
  v1.setDate(v1.getDate() - 7);
  if (d >= v0) return { key: "denna_vecka", label: "Denna veckan" };
  if (d >= v1) return { key: "forra_vecka", label: "Förra veckan" };
  const manad = d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
  return { key: `m-${d.getFullYear()}-${d.getMonth()}`, label: manad.charAt(0).toUpperCase() + manad.slice(1) };
}

/** Veckodag, datum och tid i egen kolumn. */
function tidsKolumn(iso?: string | null) {
  if (!iso) return { veckodag: "—", datum: "—", tid: "" };
  const d = new Date(iso);
  const veckodag = d.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "");
  return {
    veckodag: veckodag.charAt(0).toUpperCase() + veckodag.slice(1),
    datum: d.toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" }),
    tid: d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * Spårbarhet i två tydliga steg: först söker man fram produkt eller kategori
 * och väljer parti i listan, sedan öppnas partiets hela flöde på egen yta.
 */
export default function LotTraceabilityView({ currency = "SEK", showCosts = true, onEmptyAction }: Props) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"flode" | "graf" | "historik" | "natverk">("flode");
  const [sort, setSort] = useState<
    | "senaste"
    | "aldst"
    | "andrad"
    | "bast_fore"
    | "langst"
    | "storst"
    | "minst"
    | "varde"
    | "namn"
    | "leverantor"
    | "parti"
  >("senaste");

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["lots_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, supplier_lot_id, commercial_name, latin_name, species_fao_code, catch_area, fishing_gear, vessel_name, best_before, quantity_kg, unit_cost, price_status, preliminary_unit_cost, invoice_number, invoice_date, status, is_thawed, created_at, fishing_trip_id, incoming_catch_cert, statistical_doc, seal_number, parasite_treatment_required, freeze_start, freeze_end, exemption_reason, exemption_source, suppliers(name), products(name, sku, category, hs_code, export_documentation_required)",
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as any[];
    },
  });

  /** Senaste händelsen per parti, så listan kan sorteras på "senast ändrad". */
  const { data: senasteHandelse = {} } = useQuery({
    queryKey: ["lots_last_movement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("lot_id, created_at")
        .not("lot_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of data as any[]) if (r.lot_id && !map[r.lot_id]) map[r.lot_id] = r.created_at;
      return map;
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

  /** Kategorier att filtrera på, direkt ur partiernas produkter. */
  const kategorier = useMemo(() => {
    const s = new Set<string>();
    lots.forEach((l) => l.products?.category && s.add(l.products.category));
    return [...s].sort((a, b) => a.localeCompare(b, "sv"));
  }, [lots]);
  const [kategori, setKategori] = useState<string | null>(null);
  /** Vald produkt (namn) — steg 1b, listar bara den produktens partier. */
  const [valdProdukt, setValdProdukt] = useState<string | null>(null);

  /** Partier som matchar sökningen, oavsett vald produkt. */
  const matchade = useMemo(() => {
    const s = q.trim().toLowerCase();
    let bas = lots;
    if (kategori) bas = bas.filter((l) => l.products?.category === kategori);
    if (s)
      bas = bas.filter((l) =>
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
          l.products?.category,
        ]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(s)),
      );
    return bas;
  }, [lots, q, kategori]);

  /** Träffade produkter med antal partier, så man först väljer produkt. */
  const produktTraffar = useMemo(() => {
    const map = new Map<string, { namn: string; kategori?: string; antal: number; kg: number; varde: number | null }>();
    matchade.forEach((l) => {
      const namnP = l.products?.name || l.commercial_name || "—";
      const rad = map.get(namnP) || { namn: namnP, kategori: l.products?.category, antal: 0, kg: 0, varde: 0 };
      rad.antal += 1;
      rad.kg += Number(l.quantity_kg || 0);
      if (rad.varde != null)
        rad.varde = l.unit_cost != null ? rad.varde + Number(l.quantity_kg || 0) * Number(l.unit_cost) : rad.varde;
      map.set(namnP, rad);
    });
    return [...map.values()].sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, "sv"));
  }, [matchade]);

  const filtered = useMemo(() => {
    const bas = valdProdukt
      ? matchade.filter((l) => (l.products?.name || l.commercial_name || "—") === valdProdukt)
      : matchade;
    const kopia = [...bas];
    const varde = (l: any) => (l.unit_cost != null ? Number(l.quantity_kg || 0) * Number(l.unit_cost) : 0);
    if (sort === "senaste") kopia.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    if (sort === "aldst") kopia.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (sort === "andrad")
      kopia.sort((a, b) =>
        String(senasteHandelse[b.id] || b.created_at).localeCompare(String(senasteHandelse[a.id] || a.created_at)),
      );
    if (sort === "bast_fore")
      kopia.sort((a, b) => String(a.best_before || "9999-12-31").localeCompare(String(b.best_before || "9999-12-31")));
    if (sort === "langst")
      kopia.sort((a, b) => String(b.best_before || "0000-01-01").localeCompare(String(a.best_before || "0000-01-01")));
    if (sort === "storst") kopia.sort((a, b) => Number(b.quantity_kg || 0) - Number(a.quantity_kg || 0));
    if (sort === "minst") kopia.sort((a, b) => Number(a.quantity_kg || 0) - Number(b.quantity_kg || 0));
    if (sort === "varde") kopia.sort((a, b) => varde(b) - varde(a));
    if (sort === "leverantor")
      kopia.sort((a, b) => String(a.suppliers?.name || "").localeCompare(String(b.suppliers?.name || ""), "sv"));
    if (sort === "parti")
      kopia.sort((a, b) => String(a.lot_number || "").localeCompare(String(b.lot_number || ""), "sv", { numeric: true }));
    if (sort === "namn")
      kopia.sort((a, b) =>
        String(a.products?.name || a.commercial_name || "").localeCompare(
          String(b.products?.name || b.commercial_name || ""),
          "sv",
        ),
      );
    /** Vid sökning hålls partierna samlade under sin produkt, med vald sortering inom gruppen. */
    if (q.trim() && !valdProdukt) {
      const namnAv = (l: any) => String(l.products?.name || l.commercial_name || "—");
      const ordning: string[] = [];
      kopia.forEach((l) => {
        const n = namnAv(l);
        if (!ordning.includes(n)) ordning.push(n);
      });
      kopia.sort((a, b) => ordning.indexOf(namnAv(a)) - ordning.indexOf(namnAv(b)));
    }
    return kopia;
  }, [matchade, valdProdukt, sort, senasteHandelse, q]);


  const lot = useMemo(() => lots.find((l) => l.id === selectedId) ?? null, [lots, selectedId]);

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

  /** Var partiets kilon ligger just nu, per lagerplats. */
  const perPlats = useMemo(() => {
    const map = new Map<string, number>();
    movements.forEach((m) => {
      const namnPlats = m.storage_locations?.name || "Okänd plats";
      map.set(namnPlats, (map.get(namnPlats) || 0) + Number(m.quantity_kg || 0));
    });
    return [...map.entries()]
      .map(([plats, kg]) => ({ plats, kg }))
      .filter((r) => Math.abs(r.kg) > 0.001)
      .sort((a, b) => b.kg - a.kg);
  }, [movements]);

  /** Löpande saldo per händelse — den röda tråden. */
  const tidslinje = useMemo(() => {
    let saldoLopande = 0;
    return movements.map((m, i) => {
      saldoLopande += Number(m.quantity_kg || 0);
      return {
        ...m,
        saldoEfter: saldoLopande,
        gap: i === 0 ? null : gapBetween(movements[i - 1].created_at, m.created_at),
        sist: i === movements.length - 1,
      };
    });
  }, [movements]);

  const sorteringar = [
    { v: "senaste", label: "Senast skapad" },
    { v: "aldst", label: "Äldst skapad" },
    { v: "andrad", label: "Senast ändrad" },
    { v: "bast_fore", label: "Kortast hållbarhet" },
    { v: "langst", label: "Längst hållbarhet" },
    { v: "storst", label: "Störst mängd" },
    { v: "minst", label: "Minst mängd" },
    { v: "varde", label: "Högst värde" },
    { v: "namn", label: "Namn A–Ö" },
    { v: "leverantor", label: "Leverantör A–Ö" },
    { v: "parti", label: "Partinummer" },
  ] as const;

  const modes = [
    { v: "flode", label: "Partier och flöde", icon: Route },
    { v: "graf", label: "Släktträd", icon: GitBranch },
    { v: "historik", label: "Historik", icon: History },
    { v: "natverk", label: "Nätverk", icon: Network },
  ] as const;

  const namn = lot?.products?.name || lot?.commercial_name || "—";
  const varningFrys =
    lot?.parasite_treatment_required &&
    !(lot?.freeze_start && lot?.freeze_end) &&
    !(lot?.exemption_reason && lot?.exemption_source);
  const partiVarde = lot?.unit_cost != null ? saldo * Number(lot.unit_cost) : null;

  const [panel, setPanel] = useState<"kedja" | "handelser" | "pass" | "detaljer">("kedja");

  /** Sökningen går direkt till partilistan — partiet är rubriken. */
  const visaProduktval = false;


  return (
    <div className="flex flex-col gap-4">
      {/* Vylägen */}
      <div className="flex shrink-0 flex-wrap gap-4 border-b border-border print:hidden">
        {modes.map((m) => (
          <button
            key={m.v}
            onClick={() => setMode(m.v as typeof mode)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-xs transition-colors ${
              mode === m.v
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <m.icon className="h-3.5 w-3.5" />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {mode === "graf" && <LineageGraphView currency={currency} startLotId={selectedId} />}
      {mode === "historik" && <LotHistoryView currency={currency} />}
      {mode === "natverk" && <ProductNetworkGraph currency={currency} />}

      {mode === "flode" && (
        <>
          {isLoading && <p className="text-sm text-muted-foreground">Hämtar partier…</p>}

          {/* STEG 1 — sök fram produkt eller kategori och välj parti */}
          {!isLoading && !selectedId && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setValdProdukt(null);
                    setVisaForslag(true);
                  }}
                  onFocus={() => setVisaForslag(true)}
                  placeholder="Sök produkt, kategori, parti, leverantör eller art"
                  className="h-11 pl-9 text-sm"
                />
                {visaForslag && q.trim().length > 0 && produktTraffar.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {produktTraffar.slice(0, 10).map((p) => (
                      <button
                        key={p.namn}
                        onClick={() => {
                          setValdProdukt(p.namn);
                          setVisaForslag(false);
                        }}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <ProductThumb
                          src={produktBilder[p.namn] ?? null}
                          alt={p.namn}
                          className="h-8 w-9 shrink-0 rounded-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{p.namn}</p>
                          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                            {p.kategori || "Utan kategori"} · {p.antal} {p.antal === 1 ? "parti" : "partier"}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {nf(p.kg, 1)} kg
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>


              {kategorier.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setKategori(null)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      kategori === null
                        ? "border-primary bg-primary/10 font-semibold text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Alla kategorier
                  </button>
                  {kategorier.map((k) => (
                    <button
                      key={k}
                      onClick={() => setKategori(kategori === k ? null : k)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        kategori === k
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}

              {visaProduktval ? (
                <>
                  <p className="border-b border-border pb-2 text-[11px] text-muted-foreground">
                    {produktTraffar.length} produkter matchar — välj produkt för att se dess partier
                  </p>
                  <div className="max-h-[calc(100dvh-20rem)] min-h-[240px] overflow-y-auto rounded-md border border-border">
                    {produktTraffar.map((p) => (
                      <button
                        key={p.namn}
                        onClick={() => setValdProdukt(p.namn)}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{p.namn}</p>
                          {p.kategori && (
                            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                              {p.kategori}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm tabular-nums text-foreground">{nf(p.kg, 1)} kg</p>
                          <p className="text-[10px] text-muted-foreground">
                            {p.antal} {p.antal === 1 ? "parti" : "partier"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
              {valdProdukt && (
                <button
                  onClick={() => setValdProdukt(null)}
                  className="flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" /> Alla produkter · visar {valdProdukt}
                </button>
              )}

              <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                <div className="min-w-0">
                  {(q.trim() || kategori || valdProdukt) && (
                    <p className="truncate text-sm font-semibold text-foreground">
                      {valdProdukt || q.trim() || kategori}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? "parti" : "partier"}
                  </p>
                </div>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="bg-transparent text-[11px] text-muted-foreground focus:outline-none"
                  aria-label="Sortera partier"
                >
                  {sorteringar.map((s) => (
                    <option key={s.v} value={s.v}>
                      Sorterat: {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Fish className="h-4 w-4" />}
                  title={q.trim() || kategori ? "Inga partier matchar sökningen" : "Inga partier registrerade ännu"}
                  description={
                    q.trim() || kategori
                      ? "Sök på produkt, kategori, partinummer, art, fångstområde eller fartyg."
                      : "Partier skapas automatiskt när en inköpsrapport bokförs."
                  }
                  actionLabel={q.trim() || kategori ? "Rensa sökning" : onEmptyAction ? "Till inköpsrapportering" : undefined}
                  onAction={
                    q.trim() || kategori
                      ? () => {
                          setQ("");
                          setKategori(null);
                        }
                      : onEmptyAction
                  }
                />
              ) : (
                <div className="max-h-[calc(100dvh-20rem)] min-h-[240px] overflow-y-auto rounded-md border border-border">
                  {filtered.map((l, i) => {
                    const d = dagarKvar(l.best_before);
                    const kg = Number(l.quantity_kg || 0);
                    const varde = l.unit_cost != null ? kg * Number(l.unit_cost) : null;
                    const andrad = senasteHandelse[l.id];
                    const tidsstampel = sort === "andrad" ? andrad || l.created_at : l.created_at;
                    const grupp = tidsGrupp(tidsstampel);
                    const foregaende = i === 0 ? null : filtered[i - 1];
                    const foregGrupp = foregaende
                      ? tidsGrupp(sort === "andrad" ? senasteHandelse[foregaende.id] || foregaende.created_at : foregaende.created_at)
                      : null;
                    const produktNamn = l.products?.name || l.commercial_name || "—";
                    const foregProdukt = foregaende
                      ? foregaende.products?.name || foregaende.commercial_name || "—"
                      : null;
                    /** Vid sökning grupperas partierna under produktnamnet, annars på tid. */
                    const grupperaPaProdukt = !!q.trim() && !valdProdukt;
                    const visaRubrik = grupperaPaProdukt
                      ? produktNamn !== foregProdukt
                      : ["senaste", "aldst", "andrad"].includes(sort) && grupp.key !== foregGrupp?.key;
                    const rubrik = grupperaPaProdukt ? produktNamn : grupp.label;
                    const kol = tidsKolumn(tidsstampel);
                    return (
                      <div key={l.id}>
                        {visaRubrik && (
                          <p className="sticky top-0 z-10 border-b border-border/60 bg-muted/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                            {rubrik}
                          </p>
                        )}

                      <button
                        onClick={() => setSelectedId(l.id)}
                        className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <div className="w-[74px] shrink-0 border-r border-border/60 pr-2 font-mono text-[10px] leading-tight tabular-nums text-muted-foreground">
                          <p className="font-semibold text-foreground">{kol.veckodag}</p>
                          <p>{kol.datum}</p>
                          <p>{kol.tid}</p>
                        </div>
                        <span className={`h-8 w-1 shrink-0 rounded-full ${hallbarhetsFarg(d).split(" ")[0]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm font-semibold text-foreground">
                            {l.lot_number || "Utan partinummer"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {l.products?.name || l.commercial_name || "—"}
                            {l.products?.category && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider">{l.products.category}</span>
                            )}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            skapad {String(l.created_at).slice(0, 10)}
                            {andrad ? ` · ändrad ${String(andrad).slice(0, 10)}` : ""}
                          </p>
                        </div>

                        {l.best_before && (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${hallbarhetsFarg(d)}`}>
                            {d !== null && d < 0 ? `${Math.abs(d)} d sedan` : `${d} d kvar`}
                          </span>
                        )}
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm tabular-nums text-foreground">{nf(kg, 1)} kg</p>
                          {showCosts && varde != null && (
                            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                              {nf(varde, 0)} {currency}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                      </div>
                    );
                  })}
                 </div>
               )}
                </>
              )}
             </div>
           )}

          {/* STEG 2 — hela flödet för det valda partiet */}
          {!isLoading && lot && (
            <div className="flex min-h-0 flex-col gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-fit gap-1 px-2 text-xs print:hidden"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Alla partier
              </Button>

              {/* Rubrik */}
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-semibold tracking-tight text-foreground">{namn}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {lot.lot_number}
                    {lot.suppliers?.name ? ` · ${lot.suppliers.name}` : ""}
                    {lot.best_before ? ` · bäst före ${lot.best_before}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {lot.status}
                    </Badge>
                    {lot.best_before && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${hallbarhetsFarg(dagarKvar(lot.best_before))}`}
                      >
                        {(() => {
                          const d = dagarKvar(lot.best_before);
                          return d !== null && d < 0 ? `Passerad ${Math.abs(d)} d` : `${d} d kvar`;
                        })()}
                      </span>
                    )}
                    {lot.is_thawed && (
                      <Badge variant="outline" className="text-[10px]">
                        Upptinad
                      </Badge>
                    )}
                    {varningFrys && (
                      <Badge variant="destructive" className="text-[10px]">
                        Frysbehandling saknas
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-semibold tabular-nums leading-none text-foreground">
                    {nf(saldo, 1)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">kg kvar</p>
                  {showCosts && partiVarde != null && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {nf(partiVarde, 0)} {currency} · {nf(Number(lot.unit_cost), 2)} {currency}/kg
                    </p>
                  )}
                </div>
              </div>

              {/* Flödet, färgat per steg */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {steps.map((s, i) => {
                  const aktiv = s.count > 0;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <div className={`min-w-[104px] ${aktiv ? "" : "opacity-35"}`}>
                        <div className="flex items-center gap-1.5">
                          <s.icon className={`h-3.5 w-3.5 ${aktiv ? s.color : "text-muted-foreground"}`} />
                          <span className="text-[11px] font-medium text-foreground">{s.label}</span>
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {aktiv ? `${s.kg > 0 ? "+" : ""}${nf(s.kg, 1)} kg` : "—"}
                        </p>
                      </div>
                      {i < steps.length - 1 && <div className="h-px w-6 shrink-0 bg-border" />}
                    </div>
                  );
                })}
              </div>

              {/* Var kilona finns just nu */}
              <div className="border-y border-border py-2">
                <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  I lager nu
                </p>
                {perPlats.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Inget saldo kvar på partiet – allt är sålt, omvandlat eller bortskrivet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {perPlats.map((r) => (
                      <p key={r.plats} className="text-xs">
                        <span className="text-muted-foreground">{r.plats}</span>{" "}
                        <span className="font-mono font-semibold tabular-nums text-emerald-600">{nf(r.kg, 1)} kg</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Flikar så man väljer vad man vill se */}
              <div className="flex gap-4 border-b border-border">
                {(
                  [
                    { v: "kedja", label: "Flödesträd" },
                    { v: "handelser", label: `Händelser (${movements.length})` },
                    { v: "pass", label: "Partipass" },
                    { v: "detaljer", label: "Dokument och pris" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.v}
                    onClick={() => setPanel(t.v)}
                    className={`-mb-px border-b-2 pb-2 text-xs transition-colors ${
                      panel === t.v
                        ? "border-primary font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {panel === "kedja" && (
                  <LotChainGraph
                    movements={movements as any}
                    lotNumber={lot.lot_number}
                    productName={namn}
                    unitCost={lot.unit_cost != null && showCosts ? Number(lot.unit_cost) : null}
                    currency={currency}
                  />
                )}

                {panel === "handelser" &&
                  (tidslinje.length === 0 ? (
                    <p className="py-4 text-xs text-muted-foreground">Inga rörelser kopplade till partiet.</p>
                  ) : (
                    <ol className="relative border-l border-border pl-4">
                      {tidslinje.map((m) => {
                        const minus = Number(m.quantity_kg) < 0;
                        return (
                          <li key={m.id} className="relative pb-4">
                            <span
                              className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${
                                minus ? "bg-rose-500" : "bg-emerald-500"
                              }`}
                            />
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {stampSv(m.created_at)}
                              </p>
                              <p className="font-mono text-xs tabular-nums">
                                <span className={minus ? "text-rose-600" : "text-emerald-600"}>
                                  {minus ? "" : "+"}
                                  {nf(Number(m.quantity_kg), 1)} kg
                                </span>
                                <span className="text-muted-foreground"> → saldo {nf(m.saldoEfter, 1)} kg</span>
                              </p>
                            </div>
                            <p className="text-xs font-medium text-foreground">
                              {movementLabel(m.movement_type)}
                              <span className="font-normal text-muted-foreground">
                                {m.storage_locations?.name ? ` · ${m.storage_locations.name}` : ""}
                                {` · ${m.staff ? `${m.staff.first_name} ${m.staff.last_name}` : "System"}`}
                              </span>
                            </p>
                            {m.note && <p className="text-[11px] text-muted-foreground">{m.note}</p>}
                            <p className="text-[10px] text-muted-foreground">
                              {m.gap ? `Låg orörd ${m.gap} innan detta` : "Första händelsen"}
                              {m.sist ? ` · senaste händelsen var ${sinceNow(m.created_at)} sedan` : ""}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  ))}

                {panel === "pass" && (
                  <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
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
                    <Rad label="Art (latin)" value={lot.latin_name} />
                    <Rad label="Art (FAO)" value={lot.species_fao_code} />
                    <Rad label="Artikelnummer" value={lot.products?.sku} />
                    <Rad label="Fångstintyg" value={lot.incoming_catch_cert} />
                    <Rad label="Statistikdok" value={lot.statistical_doc} />
                    <Rad label="Plomb" value={lot.seal_number} />
                    <Rad label="Bäst före" value={lot.best_before} />
                    <Rad label="Registrerat" value={stampSv(lot.created_at)} />
                  </div>
                )}

                {panel === "detaljer" && (
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
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
