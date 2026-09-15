import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Gemensamt skal för alla sidor under Schema. Samma kompakta ram som
 * schemaplaneringen: tunn rubrikrad, smal sifferremsa, verktygsrad och en
 * kropp som skrollar internt så veckan får plats på skärmen.
 */

export function StaffPageShell({
  label,
  title,
  meta,
  actions,
  metrics,
  toolbar,
  side,
  children,
}: {
  label: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
  toolbar?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-3 md:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <h1 className="truncate text-2xl font-semibold leading-tight text-foreground">{title}</h1>
            </div>
            {meta ? <p className="hidden text-sm text-muted-foreground sm:block">{meta}</p> : null}
          </div>
          {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>

        {metrics ? (
          <section
            className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border bg-muted/20 px-4 py-2.5"
            aria-label="Nyckeltal"
          >
            {metrics}
          </section>
        ) : null}

        {toolbar ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">{toolbar}</div>
        ) : null}

        <div className={cn("grid min-h-0 flex-1", side ? "lg:grid-cols-[minmax(0,1fr)_260px]" : "")}>
          <div className="min-w-0 overflow-auto">{children}</div>
          {side ? (
            <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-muted/10 p-4 lg:block">{side}</aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Ett tal i sifferremsan: etikett över, mono-tal under. */
export function StaffMetric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "warn" | "alert";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-mono text-lg font-medium tabular-nums",
          tone === "alert" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
