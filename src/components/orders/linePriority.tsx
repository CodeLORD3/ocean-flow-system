import { Weight, Snowflake, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prioritet på en butiksorderrad. Butiken markerar varför varan behövs så att
 * grossisten kan se skillnad på kundbeställt (måste med) och påfyllning till
 * kyldisken — utan att någon behöver ringa inköparen.
 */
export type LinePriority = "must" | "nice" | "skip";

export const PRIORITY_ORDER: LinePriority[] = ["must", "nice", "skip"];

export const PRIORITY_META: Record<
  LinePriority,
  { label: string; hint: string; icon: typeof Weight; chip: string; dot: string }
> = {
  must: {
    label: "Måste med",
    hint: "Kundbeställt – kan inte strykas",
    icon: Weight,
    chip: "bg-destructive/10 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  nice: {
    label: "Bra att ha",
    hint: "Påfyllning till kyldisken",
    icon: Snowflake,
    chip: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/60",
  },
  skip: {
    label: "Kan strykas",
    hint: "Stryk hellre den här om lagret inte räcker",
    icon: MinusCircle,
    chip: "bg-muted/40 text-muted-foreground/80 border-border/60",
    dot: "bg-muted-foreground/30",
  },
};

export function normalizePriority(v: unknown): LinePriority {
  return v === "must" || v === "skip" ? v : "nice";
}

const nq = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 1 });

/**
 * Liten etikett som visar prioriteten, och för "måste med" även hur många kilo
 * som är låsta till kund samt butikens kommentar.
 */
export function LinePriorityBadge({
  priority,
  qty,
  unit,
  note,
  className,
  showLabel = true,
}: {
  priority: unknown;
  qty?: number | string | null;
  unit?: string | null;
  note?: string | null;
  className?: string;
  showLabel?: boolean;
}) {
  const p = normalizePriority(priority);
  if (p === "nice") return null;
  const meta = PRIORITY_META[p];
  const Icon = meta.icon;
  const q = Number(qty);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
        meta.chip,
        className,
      )}
      title={[meta.hint, note].filter(Boolean).join(" · ")}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {p === "must" && q > 0 && (
        <span className="font-mono tabular-nums">
          {nq(q)} {unit || "kg"}
        </span>
      )}
      {showLabel && <span className="uppercase tracking-wider">{meta.label}</span>}
      {note && <span className="max-w-[140px] truncate font-normal normal-case">{note}</span>}
    </span>
  );
}
