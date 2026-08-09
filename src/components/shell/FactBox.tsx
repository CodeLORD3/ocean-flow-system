import { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Informationspanel till höger om listan, som FactBox i Business Central.
 * Visar sammanhang för markerad rad utan att man lämnar listan.
 */
export function FactBox({
  title = "Detaljer",
  onClose,
  children,
  empty,
}: {
  title?: string;
  onClose?: () => void;
  children?: ReactNode;
  /** Text som visas när ingen rad är markerad. */
  empty?: string;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-grid-line bg-muted/40 xl:flex">
      <div className="flex items-center justify-between border-b border-grid-line bg-card px-3 py-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng panel"
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-3">
        {children ?? (
          <p className="text-xs text-muted-foreground">
            {empty ?? "Markera en rad för att se detaljer."}
          </p>
        )}
      </div>
    </aside>
  );
}

/** Nyckel/värde-rad i FactBox. Tal högerställda i monospace. */
export function FactRow({
  label,
  value,
  numeric,
}: {
  label: string;
  value: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={numeric ? "font-mono font-medium tabular-nums" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

/** Grupp med rubrik i FactBox. */
export function FactGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-sm border border-grid-line bg-card p-2.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
