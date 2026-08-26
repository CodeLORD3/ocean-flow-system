import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Layers, ListChecks, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  generateTotalOrderedChecklistPdf,
  type TotalChecklistGroup,
} from "@/lib/totalOrderedChecklistPdf";

export type PrintableGroup = TotalChecklistGroup & { key: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Grupper i samma ordning som listan visar dem (dag eller vecka). */
  groups: PrintableGroup[];
  mode: "day" | "week";
  storeName?: string;
}

/** Slår ihop flera perioder till en gemensam lista per produkt och enhet. */
function mergeGroups(groups: PrintableGroup[]): TotalChecklistGroup {
  const rows = new Map<string, TotalChecklistGroup["rows"][number]>();
  let orderCount = 0;
  for (const g of groups) {
    orderCount += g.orderCount;
    for (const r of g.rows) {
      const k = `${r.name}__${r.unit}`;
      const cur = rows.get(k);
      if (cur) {
        cur.total += r.total;
        cur.orderCount += r.orderCount;
      } else {
        rows.set(k, { ...r });
      }
    }
  }
  return {
    label: groups.map((g) => g.label).join(" + "),
    orderCount,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "sv")),
  };
}

/**
 * Låter användaren välja vilka dagar eller veckor som ska med i den
 * utskrivbara checklistan, och om de ska summeras ihop eller listas var för sig.
 */
export function PrintTotalChecklistDialog({ open, onOpenChange, groups, mode, storeName }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [combine, setCombine] = useState(false);

  useEffect(() => {
    if (open) setSelected(groups.map((g) => g.key));
  }, [open, groups]);

  const chosen = useMemo(() => groups.filter((g) => selected.includes(g.key)), [groups, selected]);

  const totals = useMemo(() => {
    const products = new Set<string>();
    let orders = 0;
    for (const g of chosen) {
      orders += g.orderCount;
      for (const r of g.rows) products.add(`${r.name}__${r.unit}`);
    }
    return { orders, products: products.size };
  }, [chosen]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const allPicked = selected.length === groups.length && groups.length > 0;

  const print = () => {
    if (!chosen.length) return;
    generateTotalOrderedChecklistPdf({
      periodLabel: combine
        ? `Samlad lista: ${chosen.map((g) => g.label).join(", ")}`
        : chosen.map((g) => g.label).join("  ·  "),
      storeName,
      groups: combine ? [mergeGroups(chosen)] : chosen,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 border-b border-border/60 px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" /> Skriv ut checklista
          </DialogTitle>
          <DialogDescription className="text-xs">
            Välj vilka {mode === "week" ? "veckor" : "dagar"} som ska med. Kryssrutor för sorterat och
            packat skrivs ut på varje rad.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {mode === "week" ? "Veckor" : "Datum"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelected(allPicked ? [] : groups.map((g) => g.key))}
            >
              {allPicked ? "Avmarkera alla" : "Markera alla"}
            </Button>
          </div>

          <div className="space-y-1">
            {groups.map((g) => {
              const on = selected.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => toggle(g.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    on ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <Checkbox checked={on} className="pointer-events-none" />
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium capitalize">{g.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {g.rows.length} varor
                  </span>
                  <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px] font-normal leading-4">
                    {g.orderCount} ordrar
                  </Badge>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setCombine((v) => !v)}
            className={`mt-3 flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
              combine ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/40"
            }`}
          >
            <Checkbox checked={combine} className="pointer-events-none mt-0.5" />
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Slå ihop till en gemensam lista</span>
              <span className="block text-[11px] text-muted-foreground">
                Summerar samma vara över valda {mode === "week" ? "veckor" : "dagar"} – bra när du sorterar
                t.ex. torsdag och fredag i ett svep.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
          <span className="text-[11px] text-muted-foreground">
            {chosen.length} {mode === "week" ? "veckor" : "dagar"} · {totals.products} varor ·{" "}
            {totals.orders} ordrar
          </span>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={print} disabled={!chosen.length}>
            <Printer className="h-4 w-4" /> Skriv ut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
