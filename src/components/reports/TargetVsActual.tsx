import { useStoreTargets, targetKey } from "@/hooks/useStoreTargets";
import { cn } from "@/lib/utils";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** Mål mot utfall för en butik och vecka (butikens valuta). */
export function TargetVsActual({
  storeId, isoYear, isoWeek, actual, cur = "kr", label = "Mål mot utfall",
}: { storeId: string; isoYear: number; isoWeek: number; actual: number; cur?: string; label?: string }) {
  const { data = [] } = useStoreTargets();
  const t = data.find((x) => targetKey(x.store_id, x.iso_year, x.iso_week) === targetKey(storeId, isoYear, isoWeek));
  const target = Number(t?.target_sales_ex_vat ?? 0);
  if (!target) return <p className="mt-2 text-[10px] text-muted-foreground">Inget veckomål satt.</p>;
  const pct = Math.round((actual / target) * 100);
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono tabular-nums", pct >= 100 ? "text-success" : pct >= 85 ? "text-warning" : "text-destructive")}>
          {int.format(actual)} / {int.format(target)} {cur} · {pct} %
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
        <div className={cn("h-full", pct >= 100 ? "bg-success" : pct >= 85 ? "bg-warning" : "bg-destructive")} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
