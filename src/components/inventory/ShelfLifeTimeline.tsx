import { useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  CalendarClock,
  Layers,
  Package,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Hållbarhetsdiagram: tidslinje med idag som mittstreck, kalenderaxel med
 * veckodag och datum, samt statistik över hur stor del av lagret som har
 * hållbarhetsdatum, vilket värde som ligger i respektive nivå och vilka varor
 * som är kritiska. Kan visas per produkt (ett streck per vara, som skissen)
 * eller per parti.
 */

type Row = {
  id: string;
  product_id: string;
  quantity: number | string | null;
  expiry_date?: string | null;
  location_id?: string | null;
  storage_locations?: { name?: string | null } | null;
};

/** Skala: dagar → position i procent. −30 dagar = 0 %, idag = 26 %, +45 dagar = 100 %. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 45;
const TODAY_PCT = 26;

const pctFor = (days: number) => {
  const d = Math.max(-PAST_DAYS, Math.min(FUTURE_DAYS, days));
  return d < 0
    ? TODAY_PCT + (d / PAST_DAYS) * TODAY_PCT
    : TODAY_PCT + (d / FUTURE_DAYS) * (100 - TODAY_PCT);
};

/** Kalenderaxel: veckodag + datum på utvalda dagar framåt och bakåt. */
const AXIS_DAYS = [-21, -7, 0, 2, 5, 10, 17, 24, 31, 45];
const LEVELS = [2, 5, 14, 30];

type BandKey = "expired" | "critical" | "soon" | "watch" | "good";

const BANDS: Record<
  BandKey,
  { label: string; bar: string; dot: string; text: string; chip: string }
> = {
  expired: {
    label: "Utgången",
    bar: "bg-gradient-to-r from-destructive to-destructive/70",
    dot: "bg-destructive",
    text: "text-destructive",
    chip: "border-destructive/40 bg-destructive/15 text-destructive",
  },
  critical: {
    label: "Kritisk",
    bar: "bg-gradient-to-r from-destructive/90 to-orange-500",
    dot: "bg-destructive",
    text: "text-destructive",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  soon: {
    label: "Snart",
    bar: "bg-gradient-to-r from-amber-500 to-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-600",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  },
  watch: {
    label: "Bevaka",
    bar: "bg-gradient-to-r from-yellow-500/80 to-yellow-400/70",
    dot: "bg-yellow-500",
    text: "text-yellow-600",
    chip: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600",
  },
  good: {
    label: "God",
    bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  },
};

const bandKeyFor = (days: number): BandKey =>
  days < 0 ? "expired" : days <= 2 ? "critical" : days <= 5 ? "soon" : days <= 14 ? "watch" : "good";

const fmtQty = (n: number, unit?: string | null) =>
  `${(Math.round(n * 10) / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${unit || "kg"}`;

const fmtSum = (n: number) =>
  (Math.round(n * 10) / 10)
    .toLocaleString("sv-SE", { maximumFractionDigits: 1 })
    .replace(/\u00a0/g, " ");

const fmtMoney = (n: number) =>
  Math.round(n).toLocaleString("sv-SE").replace(/\u00a0/g, " ");

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
  const [groupBy, setGroupBy] = useState<"product" | "lot">("product");

  const today = useMemo(() => new Date(), []);

  /** Hela lagret (även utan datum) för täckningsstatistiken. */
  const coverage = useMemo(() => {
    let kgAll = 0;
    let kgDated = 0;
    let valueAll = 0;
    let valueDated = 0;
    let lotsAll = 0;
    let lotsDated = 0;
    rows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) return;
      const price = Number(productsById.get(r.product_id)?.cost_price) || 0;
      kgAll += qty;
      valueAll += qty * price;
      lotsAll++;
      if (r.expiry_date) {
        kgDated += qty;
        valueDated += qty * price;
        lotsDated++;
      }
    });
    return { kgAll, kgDated, valueAll, valueDated, lotsAll, lotsDated };
  }, [rows, productsById]);

  const lots = useMemo(() => {
    return rows
      .filter((r) => r.expiry_date && (Number(r.quantity) || 0) > 0)
      .map((r) => {
        const p = productsById.get(r.product_id);
        const days = differenceInCalendarDays(parseISO(r.expiry_date as string), today);
        const qty = Number(r.quantity) || 0;
        const key = bandKeyFor(days);
        return {
          id: r.id,
          productId: r.product_id,
          name: p?.name || "Okänd produkt",
          unit: p?.unit || "kg",
          category: p?.category || "Övrigt",
          location: r.storage_locations?.name || "",
          qty,
          value: qty * (Number(p?.cost_price) || 0),
          expiry: r.expiry_date as string,
          lastExpiry: r.expiry_date as string,
          days,
          lastDays: days,
          lotCount: 1,
          key,
          band: BANDS[key],
        };
      });
  }, [rows, productsById, today]);

  /** Ett streck per produkt: kritiskaste partiet styr färgen, sista datumet skuggan. */
  const grouped = useMemo(() => {
    const map = new Map<string, (typeof lots)[number]>();
    lots.forEach((l) => {
      const prev = map.get(l.productId);
      if (!prev) {
        map.set(l.productId, { ...l, id: l.productId });
        return;
      }
      const merged = { ...prev };
      merged.qty += l.qty;
      merged.value += l.value;
      merged.lotCount += 1;
      if (l.days < merged.days) {
        merged.days = l.days;
        merged.expiry = l.expiry;
        merged.key = l.key;
        merged.band = l.band;
      }
      if (l.days > merged.lastDays) {
        merged.lastDays = l.days;
        merged.lastExpiry = l.expiry;
      }
      if (prev.location !== l.location) merged.location = "Flera lagerplatser";
      map.set(l.productId, merged);
    });
    return [...map.values()];
  }, [lots]);

  const all = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = groupBy === "product" ? grouped : lots;
    return base.filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q),
    );
  }, [grouped, lots, groupBy, search]);

  const summary = useMemo(() => {
    const base: Record<BandKey, { count: number; kg: number; value: number }> = {
      expired: { count: 0, kg: 0, value: 0 },
      critical: { count: 0, kg: 0, value: 0 },
      soon: { count: 0, kg: 0, value: 0 },
      watch: { count: 0, kg: 0, value: 0 },
      good: { count: 0, kg: 0, value: 0 },
    };
    all.forEach((i) => {
      base[i.key].count++;
      base[i.key].kg += i.qty;
      base[i.key].value += i.value;
    });
    return base;
  }, [all]);

  const items = useMemo(() => {
    const list = all.filter((i) => filter === "all" || i.key === filter);
    list.sort((a, b) => (sort === "critical" ? a.days - b.days : b.days - a.days));
    return list;
  }, [all, filter, sort]);

  const totalKg = items.reduce((s, i) => s + i.qty, 0);
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  const riskValue = summary.expired.value + summary.critical.value + summary.soon.value;
  const riskKg = summary.expired.kg + summary.critical.kg + summary.soon.kg;
  const coveragePct = coverage.kgAll > 0 ? (coverage.kgDated / coverage.kgAll) * 100 : 0;

  const stats = [
    {
      label: "Hållbarhet satt",
      value: `${Math.round(coveragePct)} %`,
      hint: `${fmtSum(coverage.kgDated)} av ${fmtSum(coverage.kgAll)} kg · ${coverage.lotsDated}/${coverage.lotsAll} partier`,
      tone: coveragePct >= 80 ? "text-emerald-600" : coveragePct >= 50 ? "text-amber-600" : "text-destructive",
    },
    {
      label: "Lagervärde i vyn",
      value: `${fmtMoney(totalValue)} kr`,
      hint: `${fmtSum(totalKg)} kg · ${items.length} ${groupBy === "product" ? "varor" : "partier"}`,
      tone: "text-foreground",
    },
    {
      label: "Värde i riskzon",
      value: `${fmtMoney(riskValue)} kr`,
      hint: `Utgånget, kritiskt och snart · ${fmtSum(riskKg)} kg`,
      tone: riskValue > 0 ? "text-amber-600" : "text-emerald-600",
    },
    {
      label: "Kritiska varor",
      value: `${summary.expired.count + summary.critical.count}`,
      hint: `${fmtSum(summary.expired.kg + summary.critical.kg)} kg går ut inom 2 dagar eller är utgånget`,
      tone: summary.expired.count + summary.critical.count > 0 ? "text-destructive" : "text-emerald-600",
    },
  ];

  return (
    <Card className="overflow-hidden">
      {/* Rubrik och verktyg */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          Hållbarhet
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {items.length} {groupBy === "product" ? "varor" : "partier"} · {fmtSum(totalKg)} kg
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
          <div className="flex h-8 items-center rounded-md border border-border bg-card p-0.5">
            {(
              [
                { k: "product" as const, label: "Per vara", Icon: Package },
                { k: "lot" as const, label: "Per parti", Icon: Layers },
              ]
            ).map(({ k, label, Icon }) => (
              <button
                key={k}
                type="button"
                onClick={() => setGroupBy(k)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
                  groupBy === k ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
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

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-2 border-b bg-card p-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border px-2.5 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
            <p className={cn("font-mono text-xl font-semibold leading-tight tabular-nums", s.tone)}>
              {s.value}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Nivåkort som även filtrerar listan */}
      <div className="grid grid-cols-2 gap-2 border-b bg-muted/20 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-lg border px-2.5 py-2 text-left transition-colors",
            filter === "all" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50",
          )}
        >
          <p className="text-[11px] font-medium text-muted-foreground">Alla</p>
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
                active ? "border-current shadow-sm" : "border-border bg-card hover:bg-muted/50",
                active && b.chip,
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className={cn("h-2 w-2 rounded-full", b.dot)} />
                <span className={active ? "" : "text-muted-foreground"}>{b.label}</span>
              </p>
              <p
                className={cn(
                  "font-mono text-lg font-semibold leading-tight tabular-nums",
                  s.count ? b.text : "text-muted-foreground",
                )}
              >
                {s.count}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  {fmtSum(s.kg)} kg
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground">{fmtMoney(s.value)} kr</p>
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
            {/* Kalenderaxel: veckodag och datum */}
            <div className="flex items-stretch border-b bg-muted/30">
              <span className="w-44 shrink-0 sm:w-64" />
              <span className="relative h-10 min-w-0 flex-1">
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
                {AXIS_DAYS.map((d) => (
                  <span key={d}>
                    <span
                      className={cn(
                        "absolute inset-y-0 w-px",
                        d === 0 ? "bg-foreground/70" : "border-l border-dashed border-border",
                      )}
                      style={{ left: `${pctFor(d)}%` }}
                    />
                    <span
                      className="absolute top-0.5 -translate-x-1/2 text-center leading-tight"
                      style={{ left: `${pctFor(d)}%` }}
                    >
                      <span
                        className={cn(
                          "block text-[9px] font-semibold uppercase tracking-wide",
                          d === 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {d === 0 ? "Idag" : format(addDays(today, d), "EEE", { locale: sv })}
                      </span>
                      <span className="block font-mono text-[9px] tabular-nums text-muted-foreground">
                        {format(addDays(today, d), "d/M", { locale: sv })}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
              <span className="w-16 shrink-0" />
              <span className="hidden w-16 shrink-0 sm:block" />
              <span className="w-20 shrink-0" />
              <span className="w-3 shrink-0" />
            </div>

            <div className="divide-y divide-border/60">
              {items.map((i) => {
                const left = i.days < 0 ? pctFor(i.days) : TODAY_PCT;
                const right = i.days < 0 ? TODAY_PCT : pctFor(i.days);
                const tailRight = pctFor(i.lastDays);
                const showTail = groupBy === "product" && i.lastDays > Math.max(i.days, 0);
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
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {[i.location, groupBy === "product" && i.lotCount > 1 ? `${i.lotCount} partier` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </span>

                    <span className="relative h-5 min-w-0 flex-1">
                      {AXIS_DAYS.map((d) => (
                        <span
                          key={d}
                          className={cn(
                            "absolute inset-y-0 w-px",
                            d === 0 ? "bg-foreground/30" : "border-l border-dashed border-border/60",
                          )}
                          style={{ left: `${pctFor(d)}%` }}
                        />
                      ))}
                      {LEVELS.map((d) => (
                        <span
                          key={`lvl-${d}`}
                          className="absolute inset-y-0 w-px border-l border-dotted border-border/50"
                          style={{ left: `${pctFor(d)}%` }}
                        />
                      ))}
                      {showTail && (
                        <span
                          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-border"
                          style={{
                            left: `${right}%`,
                            width: `${Math.max(tailRight - right, 0.5)}%`,
                          }}
                        />
                      )}
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
                      {format(parseISO(i.expiry), "EEE d/M", { locale: sv })}
                    </span>
                    <span
                      className={cn(
                        "w-20 shrink-0 rounded-md border px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold tabular-nums",
                        i.band.chip,
                      )}
                    >
                      {i.days < 0 ? `${Math.abs(i.days)} d sen` : `${i.days} d kvar`}
                    </span>
                    <span className="w-3 shrink-0" />
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
