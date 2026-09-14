import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, CalendarClock, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Hållbarhetsdiagram: en tidslinje med dagen idag som mittstreck.
 * Till vänster om strecket ligger utgångna partier, till höger de som håller.
 * Stödstrecken markerar nivåerna 2, 5, 14 och 30 dagar så att man ser var det
 * blir kritiskt utan att läsa datum.
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

const bandFor = (days: number) => {
  if (days < 0) return { label: "Utgången", color: "bg-destructive", text: "text-destructive" };
  if (days <= 2) return { label: "Kritisk", color: "bg-destructive/80", text: "text-destructive" };
  if (days <= 5) return { label: "Snart", color: "bg-amber-500", text: "text-amber-700" };
  if (days <= 14) return { label: "Bevaka", color: "bg-yellow-500/70", text: "text-yellow-700" };
  return { label: "God", color: "bg-emerald-500", text: "text-emerald-700" };
};

const fmtQty = (n: number, unit?: string | null) =>
  `${(Math.round(n * 10) / 10).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${unit || "kg"}`;

export function ShelfLifeTimeline({
  rows,
  productsById,
}: {
  rows: Row[];
  productsById: Map<string, any>;
}) {
  const [sort, setSort] = useState<"critical" | "longest">("critical");
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows
      .filter((r) => r.expiry_date && (Number(r.quantity) || 0) > 0)
      .map((r) => {
        const p = productsById.get(r.product_id);
        const days = differenceInCalendarDays(parseISO(r.expiry_date as string), new Date());
        return {
          id: r.id,
          name: p?.name || "Okänd produkt",
          unit: p?.unit || "kg",
          category: p?.category || "Övrigt",
          location: r.storage_locations?.name || "",
          qty: Number(r.quantity) || 0,
          expiry: r.expiry_date as string,
          days,
          band: bandFor(days),
        };
      })
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q),
      );
    list.sort((a, b) => (sort === "critical" ? a.days - b.days : b.days - a.days));
    return list;
  }, [rows, productsById, search, sort]);

  const counts = useMemo(() => {
    const out = { expired: 0, critical: 0, soon: 0, watch: 0, good: 0 };
    items.forEach((i) => {
      if (i.days < 0) out.expired++;
      else if (i.days <= 2) out.critical++;
      else if (i.days <= 5) out.soon++;
      else if (i.days <= 14) out.watch++;
      else out.good++;
    });
    return out;
  }, [items]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Hållbarhet
          <span className="font-normal text-muted-foreground">{items.length} partier</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex flex-wrap items-center gap-1 text-[10px]">
            <Badge variant="outline" className="h-4 border-destructive/30 bg-destructive/10 text-[9px] text-destructive">
              {counts.expired} utgångna
            </Badge>
            <Badge variant="outline" className="h-4 border-destructive/30 bg-destructive/5 text-[9px] text-destructive">
              {counts.critical} kritiska
            </Badge>
            <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-700">
              {counts.soon} snart
            </Badge>
            <Badge variant="outline" className="h-4 border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-700">
              {counts.good} god
            </Badge>
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök produkt…"
              className="h-7 w-36 pl-7 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "critical" ? "longest" : "critical")}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium hover:bg-muted"
          >
            {sort === "critical" ? (
              <ArrowUpWideNarrow className="h-3 w-3" />
            ) : (
              <ArrowDownWideNarrow className="h-3 w-3" />
            )}
            {sort === "critical" ? "Mest kritiskt först" : "Längst hållbarhet först"}
          </button>
        </div>
      </div>

      <CardContent className="p-0">
        {!items.length ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            Inga partier med hållbarhetsdatum i lagret.
          </p>
        ) : (
          <div className="relative">
            {/* Skala */}
            <div className="relative h-5 border-b bg-muted/30">
              <div
                className="absolute top-0 h-full border-l-2 border-foreground/70"
                style={{ left: `${TODAY_PCT}%` }}
              />
              <span
                className="absolute top-0.5 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wide"
                style={{ left: `${TODAY_PCT}%` }}
              >
                Idag
              </span>
              {LEVELS.map((l) => (
                <span key={l.days}>
                  <span
                    className="absolute top-0 h-full border-l border-dashed border-border"
                    style={{ left: `${pctFor(l.days)}%` }}
                  />
                  <span
                    className="absolute top-0.5 -translate-x-1/2 text-[9px] text-muted-foreground"
                    style={{ left: `${pctFor(l.days)}%` }}
                  >
                    {l.label}
                  </span>
                </span>
              ))}
            </div>

            <div className="divide-y">
              {items.map((i) => {
                const left = i.days < 0 ? pctFor(i.days) : TODAY_PCT;
                const right = i.days < 0 ? TODAY_PCT : pctFor(i.days);
                return (
                  <div key={i.id} className="relative flex items-center gap-2 px-2 py-1">
                    <span className="w-40 shrink-0 truncate text-[11px] font-medium sm:w-56">
                      {i.name}
                      {i.location && (
                        <span className="ml-1 font-normal text-muted-foreground">· {i.location}</span>
                      )}
                    </span>
                    <span className="relative h-4 min-w-0 flex-1">
                      {/* Stödstreck bakom stapeln */}
                      <span
                        className="absolute top-0 h-full border-l-2 border-foreground/40"
                        style={{ left: `${TODAY_PCT}%` }}
                      />
                      {LEVELS.map((l) => (
                        <span
                          key={l.days}
                          className="absolute top-0 h-full border-l border-dashed border-border"
                          style={{ left: `${pctFor(l.days)}%` }}
                        />
                      ))}
                      <span
                        className={cn("absolute top-1 h-2 rounded-full", i.band.color)}
                        style={{
                          left: `${Math.min(left, right)}%`,
                          width: `${Math.max(Math.abs(right - left), 1.2)}%`,
                        }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[10px] font-mono tabular-nums text-muted-foreground">
                      {fmtQty(i.qty, i.unit)}
                    </span>
                    <span
                      className={cn(
                        "w-24 shrink-0 text-right text-[10px] font-medium tabular-nums",
                        i.band.text,
                      )}
                    >
                      {i.days < 0 ? `${Math.abs(i.days)} d sen` : `${i.days} d kvar`}
                      <span className="ml-1 font-normal text-muted-foreground">
                        {format(parseISO(i.expiry), "d MMM", { locale: sv })}
                      </span>
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
