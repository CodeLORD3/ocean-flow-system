import { useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  History,
  Loader2,
  Plus,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProducts } from "@/hooks/useProducts";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  useAddStockReportLine,
  useRemoveStockReportLine,
  useReopenStockReport,
  useStockReportArchive,
  useStockReportLines,
  useSubmitStockReport,
  useTodayStockReport,
  todayStockholm,
  type StockReportLine,
} from "@/hooks/useStockReport";

const fmtQty = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
};

const unitLabel = (unit: string | null | undefined) => {
  const u = (unit || "kg").toLowerCase();
  if (u === "st" || u === "styck" || u === "piece") return "st";
  return unit || "kg";
};

const isPieces = (unit: string | null | undefined) => unitLabel(unit) === "st";

function groupByCategory(lines: StockReportLine[]) {
  const map = new Map<string, StockReportLine[]>();
  for (const l of lines) {
    const key = l.category || "Övrigt";
    map.set(key, [...(map.get(key) || []), l]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "sv"))
    .map(([category, rows]) => ({
      category,
      rows: rows.slice().sort((a, b) => a.product_name.localeCompare(b.product_name, "sv")),
    }));
}

function ArchiveDetail({ sheetId }: { sheetId: string }) {
  const { data: lines = [], isLoading } = useStockReportLines(sheetId);
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laddar…
      </div>
    );
  }
  if (!lines.length) {
    return <p className="p-3 text-xs text-muted-foreground">Inga produkter i rapporten.</p>;
  }
  return (
    <div className="space-y-2 p-3">
      {groupByCategory(lines).map((g) => (
        <div key={g.category}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.category}
          </p>
          {g.rows.map((l) => (
            <div key={l.id} className="flex items-center justify-between border-b border-border/30 py-1 text-xs last:border-0">
              <span className="truncate pr-2">{l.product_name}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {fmtQty(l.counted_qty_kg)} {unitLabel(l.unit)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Daglig lagerrapport för en butik: sök produkt, ange mängd, bekräfta.
 * Raderna grupperas per kategori och låses när rapporten skickas in.
 */
export function StockReportCard({
  storeId,
  compact = false,
}: {
  storeId: string;
  compact?: boolean;
}) {
  const { data: products = [] } = useProducts();
  const { data: report, isLoading } = useTodayStockReport(storeId);
  const { staff } = useStaffAuth();
  const addLine = useAddStockReportLine();
  const removeLine = useRemoveStockReportLine();
  const submit = useSubmitStockReport();
  const reopen = useReopenStockReport();
  const { data: archive = [] } = useStockReportArchive(storeId);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [qty, setQty] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<any | null>(null);

  const lines = report?.lines ?? [];
  const submitted = report?.status === "godkand";
  const addedIds = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 1) return [];
    return products
      .filter(
        (p: any) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, search]);

  const staffName = staff ? `${staff.first_name} ${staff.last_name}`.trim() : "Butiksansvarig";

  const handleAdd = async () => {
    if (!selected) return;
    const n = Number(String(qty).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Ange en mängd större än 0");
      return;
    }
    try {
      await addLine.mutateAsync({
        storeId,
        openedBy: staffName,
        product: selected,
        quantity: n,
      });
      toast.success(`${selected.name} — ${fmtQty(n)} ${unitLabel(selected.unit)}`);
      setSelected(null);
      setQty("");
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte lägga till produkten");
    }
  };

  const handleSubmit = async () => {
    if (!report) return;
    try {
      await submit.mutateAsync({ sheetId: report.id, closedBy: staffName });
      toast.success("Lagerrapporten är inskickad för i dag");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte skicka in rapporten");
    }
  };

  const totalQty = lines.reduce((s, l) => s + l.counted_qty_kg, 0);
  const kgTotal = lines.filter((l) => !isPieces(l.unit)).reduce((s, l) => s + l.counted_qty_kg, 0);
  const pcsTotal = lines.filter((l) => isPieces(l.unit)).reduce((s, l) => s + l.counted_qty_kg, 0);

  return (
    <Card
      className={cn(
        "shadow-card",
        submitted && "border-emerald-600/50 bg-emerald-500/5",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-heading">
            {submitted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Boxes className="h-4 w-4 text-primary" />
            )}
            Lagerrapport
            <span className="text-[11px] font-normal text-muted-foreground">
              {todayStockholm()}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {submitted && (
              <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">Inskickad</Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setArchiveOpen(true)}
            >
              <History className="mr-1 h-3.5 w-3.5" /> Arkiv
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {submitted
            ? `Klar för i dag — inskickad av ${report?.closed_by || staffName}.`
            : "Sök produkt, ange mängd i produktens enhet och bekräfta. Skicka in när allt är räknat."}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laddar dagens rapport…
          </div>
        )}

        {/* Sök + mängd */}
        {!submitted && (
          <div className="space-y-2">
            {selected ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{selected.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {selected.category || "Övrigt"} · anges i {unitLabel(selected.unit)}
                  </p>
                </div>
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="0"
                  className="h-10 w-24 text-center text-base tabular-nums"
                />
                <span className="text-xs text-muted-foreground">{unitLabel(selected.unit)}</span>
                <Button size="sm" className="h-10" onClick={handleAdd} disabled={addLine.isPending}>
                  <Check className="mr-1 h-4 w-4" /> Bekräfta
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10"
                  onClick={() => {
                    setSelected(null);
                    setQty("");
                  }}
                >
                  Avbryt
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Sök produkt…"
                  className="h-10 pl-8"
                />
                {matches.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                    {matches.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelected(p);
                          setQty("");
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left last:border-0 hover:bg-accent/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{p.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {p.category || "Övrigt"} · {unitLabel(p.unit)}
                          </span>
                        </span>
                        {addedIds.has(p.id) ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Tillagd
                          </Badge>
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lista per kategori */}
        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Inga produkter tillagda än.
          </p>
        ) : (
          <div className={cn("space-y-2", compact && "max-h-72 overflow-auto pr-1")}>
            {groupByCategory(lines).map((g) => (
              <div key={g.category}>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.category}
                </p>
                {g.rows.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 border-b border-border/30 py-1.5 last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">{l.product_name}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">
                      {fmtQty(l.counted_qty_kg)} {unitLabel(l.unit)}
                    </span>
                    {!submitted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Ta bort ${l.product_name}`}
                        onClick={() =>
                          removeLine.mutate({ lineId: l.id, sheetId: report!.id })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Summering + skicka in */}
        {lines.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-[11px] text-muted-foreground">
              {lines.length} produkter ·{" "}
              <span className="font-medium text-foreground tabular-nums">
                {kgTotal > 0 && `${fmtQty(kgTotal)} kg`}
                {kgTotal > 0 && pcsTotal > 0 && " · "}
                {pcsTotal > 0 && `${fmtQty(pcsTotal)} st`}
                {kgTotal === 0 && pcsTotal === 0 && fmtQty(totalQty)}
              </span>
            </p>
            {submitted ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => reopen.mutate(report!.id)}
                disabled={reopen.isPending}
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Öppna igen
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-9 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleSubmit}
                disabled={submit.isPending}
              >
                {submit.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                Skicka in
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tidigare lagerrapporter</DialogTitle>
          </DialogHeader>
          {archive.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga tidigare rapporter än.</p>
          ) : (
            <div className="space-y-1">
              {archive.map((s: any) => (
                <div key={s.id} className="rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setOpenSheet(openSheet?.id === s.id ? null : s)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/50"
                  >
                    <span className="text-xs font-medium">{s.sheet_date}</span>
                    <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {s.line_count} produkter
                      {s.status === "godkand" ? (
                        <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                          Inskickad
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Utkast
                        </Badge>
                      )}
                    </span>
                  </button>
                  {openSheet?.id === s.id && <ArchiveDetail sheetId={s.id} />}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default StockReportCard;
