import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, CalendarClock, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Hållbarhetsdiagram: en tidslinje med dagen idag som mittstreck.
 * Till vänster om strecket ligger utgångna partier, till höger de som håller.
 * Bakgrundszonerna och stödstrecken (2, 5, 14, 30 dagar) visar var det blir
 * kritiskt utan att man behöver läsa datum.
 */

type Row = {
  id: string;
  product_id: string;
  quantity: number | string | null;
  expiry_date?: string | null;
  location_id?: string | null;
  storage_locations?: { name?: string | null } | null;
};

/** Skala: dagar → position i procent. −30 dagar = 0 %, idag = 40 %, +45 dagar = 100 %. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 45;
const TODAY_PCT = 40;

const pctFor = (days: number) => {
  const d = Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, days));
  return d < 0
    ? TODAY_PCT + (d / PAST_DAYS) * TODAY_PCT
    : TODAY_PCT + (d / FUTURE_DAYS) * (100 - TODAY_PCT);
};

const LEVELS = [
  { days: 2, label: "2 d" },
  { days: 5, label: "5 d" },
  { days: 14, label: "14 d" },
  { days: 30, label: "30 d" },
];

type BandKey = "expired" | "critical" | "soon" | "watch" | "good";

const BANDS: Record<
  BandKey,
  { label: string; bar: string; dot: string; text: string; chip: string; zone: string }
> = {
  expired: {
    label: "Utgången",
    bar: "bg-gradient-to-r from-destructive to-destructive/70",
    dot: "bg-destructive",
    text: "text-destructive",
    chip: "border-destructive/40 bg-destructive/15 text-destructive",
    zone: "bg-destructive/[0.07]",
  },
  critical: {
    label: "Kritisk",
    bar: "bg-gradient-to-r from-destructive/90 to-orange-500",
    dot: "bg-destructive",
    text: "text-destructive",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    zone: "bg-destructive/[0.05]",
  },
  soon: {
    label: "Snart",
    bar: "bg-gradient-to-r from-amber-500 to-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-600",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-600",
    zone: "bg-amber-500/[0.06]",
  },
  watch: {
    label: "Bevaka",
    bar: "bg-gradient-to-r from-yellow-500/80 to-yellow-400/70",
    dot: "bg-yellow-500",
    text: "text-yellow-600",
    chip: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600",
    zone: "bg-yellow-500/[0.04]",
  },
  good: {
    label: "God",
    bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
    zone: "bg-emerald-500/[0.04]",
  },
};

const bandKeyFor = (days: number): BandKey =>
  days < 0 ? "expired" : days <= 2 ? "critical" : days <= 5 ? "soon" : days <= 14 ? "watch" : "good";

const fmtQty = (n: number, unit?: string | null) =>
  `${(Math.round(n * 10) / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${unit || "kg"}`;

const fmtSum = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 }).replace(/\u00a0/g, " ");

export function ShelfLifeTimeline({
  rows,
  productsById,
}: {
  rows: Row[];
  productsById: Map<string, any>;
}) {
  const [sort, setSort] = useState<"critical" | "longest">("critical");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BandKey | "all">("all");

  const all = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.expiry_date && (Number(r.quantity) || 0) > 0)
      .map((r) => {
        const p = productsById.get(r.product_id);
        const days = differenceInCalendarDays(parseISO(r.expiry_date as string), new Date());
        const key = bandKeyFor(days);
        return {
          id: r.id,
          name: p?.name || "Okänd produkt",
          unit: p?.unit || "kg",
          category: p?.category || "Övrigt",
          location: r.storage_locations?.name || "",
          qty: Number(r.quantity) || 0,
          expiry: r.expiry_date as string,
          days,
          key,
          band: BANDS[key],
        };
      })
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q),
      );
  }, [rows, productsById, search]);

  const summary = useMemo(() => {
    const base: Record<BandKey, { count: number; kg: number }> = {
      expired: { count: 0, kg: 0 },
      critical: { count: 0, kg: 0 },
      soon: { count: 0, kg: 0 },
      watch: { count: 0, kg: 0 },
      good: { count: 0, kg: 0 },
    };
    all.forEach((i) => {
      base[i.key].count++;
      base[i.key].kg += i.qty;
    });
    return base;
  }, [all]);

  const items = useMemo(() => {
    const list = all.filter((i) => filter === "all" || i.key === filter);
    list.sort((a, b) => (sort === "critical" ? a.days - b.days : b.days - a.days));
    return list;
  }, [all, filter, sort]);

  const totalKg = items.reduce((s, i) => s + i.qty, 0);

  return (
    <Card className="overflow-hidden">
      {/* Rubrik och verktyg */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          Hållbarhet
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {items.length} partier · {fmtSum(totalKg)} kg
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök produkt eller lagerplats…"
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "critical" ? "longest" : "critical")}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            {sort === "critical" ? (
              <ArrowUpWideNarrow className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            )}
            {sort === "critical" ? "Mest kritiskt först" : "Längst hållbarhet först"}
          </button>
        </div>
      </div>

      {/* Nivåkort som även filtrerar listan */}
      <div className="grid grid-cols-2 gap-2 border-b bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-lg border px-2.5 py-2 text-left transition-colors",
            filter === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
          )}
        >
          <p className="text-[11px] font-medium text-muted-foreground">Alla partier</p>
          <p className="font-mono text-lg font-semibold leading-tight tabular-nums">{all.length}</p>
        </button>
        {(Object.keys(BANDS) as BandKey[]).map((k) => {
          const b = BANDS[k];
          const s = summary[k];
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(active ? "all" : k)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors",
                active ? "border-current shadow-sm" : "border-border hover:bg-muted/50",
                active && b.chip,
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className={cn("h-2 w-2 rounded-full", b.dot)} />
                <span className={active ? "" : "text-muted-foreground"}>{b.label}</span>
              </p>
              <p className={cn("font-mono text-lg font-semibold leading-tight tabular-nums", s.count ? b.text : "text-muted-foreground")}>
                {s.count}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  {fmtSum(s.kg)} kg
                </span>
              </p>
            </button>
          );
        })}
      </div>

      <CardContent className="p-0">
        {!items.length ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Inga partier med hållbarhetsdatum i valt urval.
          </p>
        ) : (
          <div className="relative">
            {/* Skala med zoner */}
            <div className="relative h-7 border-b bg-muted/30">
              <span
                className="absolute inset-y-0 left-0 bg-destructive/[0.07]"
                style={{ width: `${TODAY_PCT}%` }}
              />
              <span
                className="absolute inset-y-0 bg-amber-500/[0.07]"
                style={{ left: `${TODAY_PCT}%`, width: `${pctFor(5) - TODAY_PCT}%` }}
              />
              <span
                className="absolute inset-y-0 bg-emerald-500/[0.05]"
                style={{ left: `${pctFor(14)}%`, right: 0 }}
              />
              <span
                className="absolute inset-y-0 w-px bg-foreground/70"
                style={{ left: `${TODAY_PCT}%` }}
              />
              <span
                className="absolute top-1 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-background"
                style={{ left: `${TODAY_PCT}%` }}
              >
                Idag
              </span>
              {LEVELS.map((l) => (
                <span key={l.days}>
                  <span
                    className="absolute inset-y-0 w-px border-l border-dashed border-border"
                    style={{ left: `${pctFor(l.days)}%` }}
                  />
                  <span
                    className="absolute bottom-0.5 -translate-x-1/2 text-[9px] font-medium text-muted-foreground"
                    style={{ left: `${pctFor(l.days)}%` }}
                  >
                    {l.label}
                  </span>
                </span>
              ))}
            </div>

            <div className="divide-y divide-border/60">
              {items.map((i) => {
                const left = i.days < 0 ? pctFor(i.days) : TODAY_PCT;
                const right = i.days < 0 ? TODAY_PCT : pctFor(i.days);
                return (
                  <div
                    key={i.id}
                    className="group relative flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex w-44 shrink-0 items-center gap-2 sm:w-64">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", i.band.dot)} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold leading-tight">
                          {i.name}
                        </span>
                        {i.location && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {i.location}
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="relative h-5 min-w-0 flex-1">
                      {/* Stödstreck bakom stapeln */}
                      <span
                        className="absolute inset-y-0 w-px bg-foreground/30"
                        style={{ left: `${TODAY_PCT}%` }}
                      />
                      {LEVELS.map((l) => (
                        <span
                          key={l.days}
                          className="absolute inset-y-0 w-px border-l border-dashed border-border/70"
                          style={{ left: `${pctFor(l.days)}%` }}
                        />
                      ))}
                      <span
                        className={cn(
                          "absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full shadow-sm ring-1 ring-inset ring-background/40 transition-all group-hover:h-3.5",
                          i.band.bar,
                        )}
                        style={{
                          left: `${Math.min(left, right)}%`,
                          width: `${Math.max(Math.abs(right - left), 1.5)}%`,
                        }}
                      />
                    </span>

                    <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
                      {fmtQty(i.qty, i.unit)}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right text-[10px] text-muted-foreground sm:block">
                      {format(parseISO(i.expiry), "d MMM", { locale: sv })}
                    </span>
                    <span
                      className={cn(
                        "w-20 shrink-0 rounded-md border px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold tabular-nums",
                        i.band.chip,
                      )}
                    >
                      {i.days < 0 ? `${Math.abs(i.days)} d sen` : `${i.days} d kvar`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ShelfLifeTimeline;
