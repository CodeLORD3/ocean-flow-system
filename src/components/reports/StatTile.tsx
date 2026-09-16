import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "navy" | "spruce" | "amber" | "brick";

const TONE: Record<StatTone, { wrap: string; chip: string; value: string; bar: string }> = {
  navy: {
    wrap: "bg-[hsl(var(--tone-navy))] border-primary/20",
    chip: "bg-primary/10 text-primary",
    value: "text-primary",
    bar: "bg-primary",
  },
  spruce: {
    wrap: "bg-[hsl(var(--tone-spruce))] border-success/25",
    chip: "bg-success/10 text-success",
    value: "text-success",
    bar: "bg-success",
  },
  amber: {
    wrap: "bg-[hsl(var(--tone-amber))] border-warning/25",
    chip: "bg-warning/10 text-warning",
    value: "text-warning",
    bar: "bg-warning",
  },
  brick: {
    wrap: "bg-[hsl(var(--tone-brick))] border-destructive/25",
    chip: "bg-destructive/10 text-destructive",
    value: "text-destructive",
    bar: "bg-destructive",
  },
};

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "navy",
  trend,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Förändring i procent mot föregående period. */
  trend?: number | null;
  /** Små staplar, normaliseras automatiskt. */
  spark?: number[];
}) {
  const t = TONE[tone];
  const max = spark && spark.length > 0 ? Math.max(...spark, 1) : 1;

  return (
    <div className={cn("rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md", t.wrap)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("rounded-md p-1.5", t.chip)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className={cn("mt-2 font-mono text-xl font-semibold tabular-nums tracking-tight", t.value)}>
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {trend != null && Number.isFinite(trend) && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
              trend >= 0 ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
            )}
          >
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(1)} %
          </span>
        )}
        {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-2 flex h-8 items-end gap-[2px]">
          {spark.map((v, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-sm opacity-70", t.bar)}
              style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatTiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}
