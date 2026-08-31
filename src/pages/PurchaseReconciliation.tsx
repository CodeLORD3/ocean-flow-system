import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, Filter, Link2, RefreshCw, Search, Settings2, TriangleAlert, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ProductThumb } from "@/components/products/ProductThumb";
import EmptyState from "@/components/EmptyState";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import {
  useConfirmProductMatch,
  useMatchCandidates,
  useReconciliation,
  useReconciliationSettings,
  useRemoveProductMatch,
  useCustomerProductMatches,
} from "@/hooks/usePurchaseReconciliation";
import {
  RECON_STATUS_HINTS,
  RECON_STATUS_LABELS,
  RECON_STATUS_PILL,
  ReconStatus,
  SURPLUS_WARNING,
  addDays,
  diffText,
  isoDate,
  mondayOf,
  qtyText,
  weekRange,
} from "@/lib/purchaseReconciliation";
import { useTabs } from "@/contexts/TabsContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_ORDER: ReconStatus[] = ["tackt", "saknas", "kontrollera", "info"];

function StatusPill({ status }: { status: ReconStatus }) {
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-full text-[10px] font-medium", RECON_STATUS_PILL[status])}>
      {status === "tackt" && <Check className="h-3 w-3" />}
      {status === "saknas" && <X className="h-3 w-3" />}
      {status === "kontrollera" && <TriangleAlert className="h-3 w-3" />}
      {status === "info" && <Filter className="h-3 w-3" />}
      {RECON_STATUS_LABELS[status]}
    </Badge>
  );
}

function weekLabel(date: Date) {
  const { week, year } = (() => {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return { week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7), year: d.getFullYear() };
  })();
  return `Vecka ${week}, ${year}`;
}

function CandidatePicker({ sourceName, onClose }: { sourceName: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: candidates = [] } = useMatchCandidates(sourceName);
  const { data: currentStaff } = useCurrentStaff();
  const confirm = useConfirmProductMatch();
  const [selectedId, setSelectedId] = useState("");

  const handleConfirm = async () => {
    if (!selectedId) return;
    try {
      await confirm.mutateAsync({ sourceName, productId: selectedId, confirmedByName: staffFullName(currentStaff) ?? null });
      toast({ title: "Produktkoppling bekräftad", description: "Kopplingen används automatiskt i kommande avstämningar." });
      onClose();
    } catch (error) {
      toast({ title: "Kunde inte bekräfta kopplingen", description: error instanceof Error ? error.message : "Försök igen.", variant: "destructive" });
    }
  };

  return (
    <div className="mt-2 rounded-lg bg-muted/30 p-2.5 ring-1 ring-inset ring-border/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Bekräfta produktmatchning</p>
          <p className="truncate text-xs">{sourceName}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Stäng matchning">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga produktkandidater hittades. Matchningen kan inte bekräftas ännu.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label className="text-[10px] text-muted-foreground">Välj rätt produkt</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj kandidat manuellt..." /></SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.unit}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!selectedId || confirm.isPending} onClick={handleConfirm}>
            <Link2 className="h-3.5 w-3.5" /> Bekräfta vald
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PurchaseReconciliation() {
  const { switchTab } = useTabs();
  const { toast } = useToast();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [onlyExceptions, setOnlyExceptions] = useState(false);
  const [category, setCategory] = useState("alla");
  const [statusFilter, setStatusFilter] = useState<ReconStatus | "alla">("alla");
  const [search, setSearch] = useState("");
  const [matchingKey, setMatchingKey] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<string[]>([]);
  const { from, to } = weekRange(monday);
  const { rows, isLoading, error } = useReconciliation({ fromDate: from, toDate: to });
  const { data: settings } = useReconciliationSettings();
  const { data: matches = [] } = useCustomerProductMatches();
  const removeMatch = useRemoveProductMatch();

  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b, "sv")), [rows]);
  const counts = useMemo(() => STATUS_ORDER.reduce((acc, status) => ({ ...acc, [status]: rows.filter((row) => row.status === status).length }), {} as Record<ReconStatus, number>), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesSearch = !search.trim() || row.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = category === "alla" || row.category === category;
    const matchesStatus = statusFilter === "alla" || row.status === statusFilter;
    const isException = row.status === "saknas" || row.status === "kontrollera";
    return matchesSearch && matchesCategory && matchesStatus && (!onlyExceptions || isException);
  }), [rows, search, category, statusFilter, onlyExceptions]);
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof filteredRows>();
    for (const row of filteredRows) grouped.set(row.category, [...(grouped.get(row.category) ?? []), row]);
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, "sv"));
  }, [filteredRows]);

  const moveWeek = (days: number) => setMonday((current) => addDays(current, days));
  const toggleRow = (key: string) => setOpenRows((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const openOrderLine = (orderId: string, lineId: string) => {
    sessionStorage.setItem("open_shop_order", JSON.stringify({ orderId, lineId }));
    window.dispatchEvent(new CustomEvent("open-shop-order", { detail: { orderId, lineId } }));
    switchTab("/orders");
  };

  const handleRemoveMatch = async (matchId: string) => {
    try {
      await removeMatch.mutateAsync(matchId);
      toast({ title: "Produktkoppling borttagen" });
    } catch (error) {
      toast({ title: "Kunde inte ta bort kopplingen", description: error instanceof Error ? error.message : "Försök igen.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-heading font-bold text-foreground"><RefreshCw className="h-5 w-5 text-primary" /> Behovsavstämning</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Kundbehov mot beställt per leveransvecka. Behovsdifferens är separat från leveransavvikelse.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => moveWeek(-7)}>← Föregående</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMonday(mondayOf(new Date()))}>Idag</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => moveWeek(7)}>Nästa →</Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vald period</p>
            <p className="font-mono text-sm font-semibold tabular-nums">{weekLabel(monday)}</p>
            <p className="text-xs text-muted-foreground">{from} – {to} · styrs av leverans-/upphämtningsdatum</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(event) => setMonday(mondayOf(new Date(`${event.target.value}T00:00:00`)))} className="h-8 w-[145px] text-xs" aria-label="Veckans startdatum" />
            <Button variant={onlyExceptions ? "default" : "outline"} size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOnlyExceptions((value) => !value)}><TriangleAlert className="h-3.5 w-3.5" /> Endast avvikelser</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <button key={status} type="button" onClick={() => setStatusFilter(statusFilter === status ? "alla" : status)} className={cn("flex items-center justify-between rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40", statusFilter === status && "ring-2 ring-primary/30")}>
            <div><StatusPill status={status} /><p className="mt-1 text-[10px] text-muted-foreground">{status === "saknas" || status === "kontrollera" ? "Kräver åtgärd" : RECON_STATUS_HINTS[status]}</p></div>
            <span className="font-mono text-xl font-semibold tabular-nums">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök produkt..." className="h-9 pl-8 text-xs" /></div>
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9 w-full text-xs sm:w-52"><SelectValue placeholder="Alla kategorier" /></SelectTrigger><SelectContent><SelectItem value="alla">Alla kategorier</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      </div>

      {error ? <EmptyState title="Kunde inte läsa avstämningen" description={error instanceof Error ? error.message : "Försök igen senare."} /> : isLoading ? <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">Läser kundbehov och grossistordrar…</CardContent></Card> : groups.length === 0 ? <EmptyState title="Inget i vald vecka" description="Det finns inga kundbehov eller grossistorderrader i det valda intervallet." /> : groups.map(([group, groupRows]) => (
        <Card key={group} className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="border-b border-border/50 bg-muted/20 px-3 py-2.5"><CardTitle className="flex items-center gap-2 text-[15px] font-semibold capitalize tracking-tight"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group}</span><Badge variant="secondary" className="rounded-full text-[10px] font-normal">{groupRows.length} varor</Badge><span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">{groupRows.reduce((sum, row) => sum + row.customerLines, 0)} rader</span></CardTitle></CardHeader>
          <CardContent className="space-y-0 px-2 pb-2 pt-0 md:px-3">
            <div className="hidden items-center gap-3 px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 md:flex"><span className="w-8" /><span className="min-w-0 flex-1">Produkt</span><span className="w-24 text-right">Kundbehov</span><span className="w-24 text-right">Beställt</span><span className="w-28 text-right">Behovsdifferens</span><span className="w-28 text-right">Status</span></div>
            {groupRows.map((row) => {
              const isOpen = openRows.includes(row.key);
              return <div key={row.key} className={cn("border-b border-border/40 last:border-b-0", isOpen && "my-1 rounded-xl bg-primary/[0.04] ring-1 ring-inset ring-primary/15")}>
                <button type="button" className="flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/40 md:gap-3" onClick={() => toggleRow(row.key)}>
                  {isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-primary" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
                  <ProductThumb src={row.imageUrl} alt={row.name} productId={row.productId} static className="h-7 w-9 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-tight md:text-xs">{row.name}</span>
                  <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums md:block">{qtyText(row.need, row.unit)} {row.unit}</span>
                  <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums md:block">{qtyText(row.ordered, row.unit)} {row.unit}</span>
                  <span className="hidden w-28 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums md:block">{row.diff == null ? "–" : `${diffText(row.diff, row.unit)} ${row.unit}`}</span>
                  <span className="shrink-0"><StatusPill status={row.status} /></span>
                </button>
                <div className="flex items-center gap-3 px-9 pb-2 text-[10px] text-muted-foreground md:hidden"><span>Kundbehov <strong className="font-mono text-foreground">{qtyText(row.need, row.unit)} {row.unit}</strong></span><span>Beställt <strong className="font-mono text-foreground">{qtyText(row.ordered, row.unit)} {row.unit}</strong></span><span className="font-mono font-semibold text-foreground">{row.diff == null ? "–" : `${diffText(row.diff, row.unit)} ${row.unit}`}</span></div>
                {isOpen && <div className="grid gap-2 px-2 pb-2 md:pl-8 lg:grid-cols-[1fr,280px]">
                  <div className="rounded-xl bg-background/60 p-2.5 ring-1 ring-inset ring-border/50">
                    <div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Underlag</span><span className="text-[10px] text-muted-foreground">{row.customerLines} kundorderrader</span></div>
                    <div className="space-y-1 text-[11px]">{row.needStores.map((store) => <div key={store.storeId} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{store.storeName}</span><span className="font-mono tabular-nums">{qtyText(store.quantity, row.unit)} {row.unit}</span></div>)}</div>
                    {row.bigSurplus && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-warning"><TriangleAlert className="h-3 w-3" /> {SURPLUS_WARNING} ({settings?.surplus_warn_pct ?? 50}%+)</p>}
                    {row.unmatchedName && <CandidatePicker sourceName={row.unmatchedName} onClose={() => setMatchingKey(null)} />}
                  </div>
                  <div className="rounded-xl bg-background/60 p-2.5 ring-1 ring-inset ring-border/50">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Grossistorderrader</p>
                    {row.shopLines.length === 0 ? <p className="text-xs text-muted-foreground">Ingen rad för denna produkt i vald vecka.</p> : <div className="space-y-1.5">{row.shopLines.map((line) => <Button key={line.lineId} variant="ghost" className="h-auto w-full justify-start gap-2 px-1 py-1 text-left text-[11px]" onClick={() => openOrderLine(line.orderId, line.lineId)}><ArrowRight className="h-3 w-3 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{line.storeName || "Butik"}</span><span className="font-mono tabular-nums">{qtyText(line.quantity, row.unit)} {row.unit}</span></Button>)}</div>}
                    {row.status === "kontrollera" && row.unmatchedName && <Button variant="outline" size="sm" className="mt-2 h-8 w-full gap-1.5 text-xs" onClick={() => setMatchingKey(matchingKey === row.key ? null : row.key)}><Link2 className="h-3.5 w-3.5" /> {matchingKey === row.key ? "Dölj matchning" : "Bekräfta produktmatchning"}</Button>}
                    {matchingKey === row.key && row.unmatchedName && <CandidatePicker sourceName={row.unmatchedName} onClose={() => setMatchingKey(null)} />}
                  </div>
                </div>}
              </div>;
            })}
          </CardContent>
        </Card>
      ))}

      {matches.length > 0 && <Card className="shadow-card"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Settings2 className="h-4 w-4 text-primary" /> Bekräftade produktkopplingar</CardTitle></CardHeader><CardContent className="space-y-1 pt-0">{matches.map((match) => <div key={match.id} className="flex items-center gap-2 border-b border-border/40 py-2 text-xs last:border-0"><span className="min-w-0 flex-1 truncate">{match.source_name}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium">{rows.find((row) => row.productId === match.product_id)?.name ?? match.product_id}</span><Button variant="ghost" size="icon" className="h-7 w-7" title="Ta bort koppling" onClick={() => handleRemoveMatch(match.id)}><X className="h-3.5 w-3.5" /></Button></div>)}</CardContent></Card>}
      <Separator />
      <p className="text-[10px] text-muted-foreground">Matchning föreslås endast som kandidat. En differens räknas först efter manuell bekräftelse.</p>
    </div>
  );
}
