import { CheckCircle2, Clock, Coffee, AlertTriangle, MinusCircle, Lock } from "lucide-react";
import { LiveStatus, STATUS_LABEL } from "@/lib/liveStaff";
import { cn } from "@/lib/utils";

const CONFIG: Record<LiveStatus, { icon: any; className: string }> = {
  working: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  planned: { icon: Clock, className: "bg-primary/10 text-primary border-primary/30" },
  break: { icon: Coffee, className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  deviation: { icon: AlertTriangle, className: "bg-destructive/10 text-destructive border-destructive/30" },
  done: { icon: MinusCircle, className: "bg-muted text-muted-foreground border-border" },
  closed: { icon: Lock, className: "bg-muted text-muted-foreground border-border" },
};

/** Färg + text + ikon — aldrig färg ensamt. */
export function StatusChip({ status, className }: { status: LiveStatus; className?: string }) {
  const { icon: Icon, className: tone } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusLegend() {
  const order: LiveStatus[] = ["working", "planned", "break", "deviation", "done", "closed"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {order.map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </div>
  );
}
