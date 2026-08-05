import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  count: number;
  label: string;
  onClick?: () => void;
};

/**
 * Liten ikonknapp med notisbubbla — används i grossistens butikslista
 * för att visa nya meddelanden, ordrar och önskemål per butik.
 */
export function ActivityIcon({ icon: Icon, count, label, onClick }: Props) {
  const active = count > 0;
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label}${active ? ` (${count})` : ""}`}
      onClick={onClick}
      className={cn(
        "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50 hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {active && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
