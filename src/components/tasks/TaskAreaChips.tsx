import { cn } from "@/lib/utils";
import type { TaskRowArea } from "@/components/tasks/TaskRow";

export type AreaChipCount = { total: number; done: number };

type Props = {
  areas: TaskRowArea[];
  counts: Map<string, AreaChipCount>;
  /** "all" | "none" | områdets id */
  selected: string;
  onSelect: (value: string) => void;
  totalCount: AreaChipCount;
};

/**
 * Områdena som snabbfilter ovanför uppgiftslistan. Färgerna är exakt
 * områdesfärgerna på butikskartan, så personalen lär sig var färgerna hör hemma.
 */
export function TaskAreaChips({ areas, counts, selected, onSelect, totalCount }: Props) {
  const chip = (key: string, label: string, color: string | null, c: AreaChipCount) => {
    const active = selected === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(key)}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors",
          active ? "bg-foreground text-background" : "bg-muted/60 text-foreground hover:bg-muted",
        )}
      >
        {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="max-w-[12rem] truncate">{label}</span>
        {c.total > 0 && (
          <span className={cn("font-mono text-[11px] tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
            {c.done}/{c.total}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {chip("all", "Alla", null, totalCount)}
      {areas.map((a) =>
        a ? chip(a.id, a.name, a.color, counts.get(a.id) ?? { total: 0, done: 0 }) : null,
      )}
    </div>
  );
}
