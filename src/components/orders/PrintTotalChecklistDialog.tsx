import { useEffect, useMemo, useState } from "react";
import { Check, Printer, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const qtyText = (v: number, unit: string) =>
  Number(v || 0).toLocaleString("sv-SE", {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: unit === "kg" ? 1 : 0,
  });

/** Slår ihop flera perioder till en gemensam lista per produkt och enhet. */
function mergeGroups(groups: TotalChecklistGroup[]): TotalChecklistGroup {
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

/** Stor, tydlig ruta man trycker på — lätt att träffa även på mobil. */
function BigOption({
  checked,
  onClick,
  title,
  hint,
  right,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-colors ${
        checked
          ? "border-primary bg-primary/10"
          : "border-border/70 bg-background hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
        }`}
      >
        {checked && <Check className="h-5 w-5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold capitalize sm:text-base">{title}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {right}
    </button>
  );
}

/**
 * Enkel utskrift i tre tydliga steg: vilka dagar, vilka varor, skriv ut.
 * Allt är förvalt så att man kan trycka direkt på "Skriv ut".
 */
export function PrintTotalChecklistDialog({ open, onOpenChange, groups, mode, storeName }: Props) {
  const periodWord = mode === "week" ? "veckor" : "dagar";

  const [days, setDays] = useState<string[]>([]);
  const [onlySome, setOnlySome] = useState(false);
  const [productKeys, setProductKeys] = useState<string[]>([]);
  const [combine, setCombine] = useState(true);
  const [search, setSearch] = useState("");

  // Förvalt: allt som syns i listan, en gemensam lista.
  useEffect(() => {
    if (!open) return;
    setDays(groups.map((g) => g.key));
    setOnlySome(false);
    setProductKeys([]);
    setCombine(true);
    setSearch("");
  }, [open, groups]);

  const chosenDays = useMemo(() => groups.filter((g) => days.includes(g.key)), [groups, days]);

  /** Alla varor som finns i de valda dagarna, med summerad mängd. */
  const products = useMemo(() => {
    const map = new Map<string, { key: string; name: string; unit: string; total: number }>();
    for (const g of chosenDays) {
      for (const r of g.rows) {
        const key = `${r.name}__${r.unit}`;
        const cur = map.get(key);
        if (cur) cur.total += r.total;
        else map.set(key, { key, name: r.name, unit: r.unit, total: r.total });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [chosenDays]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;
  }, [products, search]);

  /** Vilka varor som faktiskt kommer med: alla, eller de ibockade. */
  const activeKeys = useMemo(
    () => (onlySome ? productKeys.filter((k) => products.some((p) => p.key === k)) : products.map((p) => p.key)),
    [onlySome, productKeys, products],
  );

  const finalGroups = useMemo(() => {
    const keep = new Set(activeKeys);
    return chosenDays
      .map((g) => ({ ...g, rows: g.rows.filter((r) => keep.has(`${r.name}__${r.unit}`)) }))
      .filter((g) => g.rows.length > 0);
  }, [chosenDays, activeKeys]);

  const canPrint = finalGroups.length > 0;

  const toggleDay = (key: string) =>
    setDays((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleProduct = (key: string) =>
    setProductKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const allDays = days.length === groups.length && groups.length > 0;

  const print = () => {
    if (!canPrint) return;
    generateTotalOrderedChecklistPdf({
      periodLabel: combine
        ? `Samlad lista: ${finalGroups.map((g) => g.label).join(", ")}`
        : finalGroups.map((g) => g.label).join("  ·  "),
      storeName,
      groups: combine ? [mergeGroups(finalGroups)] : finalGroups,
      selectionNote:
        onlySome && activeKeys.length < products.length
          ? `Utvalda varor: ${activeKeys.length} av ${products.length}`
          : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b border-border/60 bg-muted/30 px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Printer className="h-5 w-5 text-primary" /> Skriv ut lista
          </DialogTitle>
          <DialogDescription className="text-sm">
            Allt är redan förvalt. Tryck på <strong>Skriv ut</strong> längst ner — eller ändra nedan först.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Steg 1 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
                Vilka {periodWord} ska med?
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => setDays(allDays ? [] : groups.map((g) => g.key))}
              >
                {allDays ? "Ta bort alla" : "Välj alla"}
              </Button>
            </div>
            <div className="space-y-2">
              {groups.map((g) => (
                <BigOption
                  key={g.key}
                  checked={days.includes(g.key)}
                  onClick={() => toggleDay(g.key)}
                  title={g.label}
                  hint={`${g.rows.length} varor · ${g.orderCount} ordrar`}
                />
              ))}
            </div>
          </section>

          {/* Steg 2 */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              Vilka varor ska med?
            </h3>
            <div className="space-y-2">
              <BigOption
                checked={!onlySome}
                onClick={() => setOnlySome(false)}
                title="Alla varor"
                hint={`${products.length} varor i valda ${periodWord}`}
              />
              <BigOption
                checked={onlySome}
                onClick={() => {
                  setOnlySome(true);
                  if (productKeys.length === 0) setProductKeys([]);
                }}
                title="Bara vissa varor"
                hint="Bocka i de varor du vill ha på papperet"
              />
            </div>

            {onlySome && (
              <div className="space-y-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {activeKeys.length} av {products.length} varor valda
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setProductKeys(products.map((p) => p.key))}
                    >
                      Välj alla
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setProductKeys([])}
                    >
                      Rensa
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Sök vara…"
                    className="h-11 pl-8 text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      aria-label="Rensa sökning"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-0.5">
                  {shown.length === 0 ? (
                    <p className="px-1 py-3 text-sm text-muted-foreground">Ingen vara matchar sökningen.</p>
                  ) : (
                    shown.map((p) => (
                      <BigOption
                        key={p.key}
                        checked={productKeys.includes(p.key)}
                        onClick={() => toggleProduct(p.key)}
                        title={p.name}
                        right={
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
                            {qtyText(p.total, p.unit)} {p.unit}
                          </span>
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Steg 3 */}
          {chosenDays.length > 1 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                Hur ska papperet se ut?
              </h3>
              <div className="space-y-2">
                <BigOption
                  checked={combine}
                  onClick={() => setCombine(true)}
                  title="En enda lista"
                  hint={`Samma vara summeras över alla valda ${periodWord}`}
                />
                <BigOption
                  checked={!combine}
                  onClick={() => setCombine(false)}
                  title={mode === "week" ? "En lista per vecka" : "En lista per dag"}
                  hint="Varje period får sin egen rubrik och tabell"
                />
              </div>
            </section>
          )}
        </div>

        <div className="space-y-2 border-t border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-center text-sm text-muted-foreground">
            {canPrint ? (
              <>
                Du skriver ut{" "}
                <strong className="text-foreground">
                  {combine
                    ? mergeGroups(finalGroups).rows.length
                    : finalGroups.reduce((n, g) => n + g.rows.length, 0)}{" "}
                  rader
                </strong>{" "}
                på {combine ? "1 lista" : `${finalGroups.length} listor`}.
              </>
            ) : (
              "Bocka i minst en dag och en vara för att kunna skriva ut."
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-12 flex-1 text-sm"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button className="h-12 flex-[2] gap-2 text-base font-semibold" onClick={print} disabled={!canPrint}>
              <Printer className="h-5 w-5" /> Skriv ut
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
