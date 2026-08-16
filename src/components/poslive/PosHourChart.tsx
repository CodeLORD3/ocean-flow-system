import { cn } from "@/lib/utils";

const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/\u00a0/g, " ");

/** Enkel timstapel över dagens försäljning — ren CSS, inga tunga beroenden. */
export function PosHourChart({
  hours,
  currentHour,
}: {
  hours: { hour: number; amount: number; receipts: number }[];
  currentHour: number | null;
}) {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const from = Math.min(7, ...hours.map((h) => h.hour));
  const to = Math.max(19, ...hours.map((h) => h.hour));
  const max = Math.max(1, ...hours.map((h) => h.amount));
  const cells = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <div className="flex items-end gap-1 h-32">
      {cells.map((h) => {
        const row = byHour.get(h);
        const amount = row?.amount ?? 0;
        const pct = (amount / max) * 100;
        return (
          <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full h-24 flex items-end">
              <div
                title={`${h}:00 — ${kr(amount)} kr, ${row?.receipts ?? 0} köp`}
                className={cn(
                  "w-full rounded-t transition-all",
                  h === currentHour ? "bg-primary" : "bg-primary/40",
                )}
                style={{ height: `${Math.max(amount > 0 ? 4 : 1, pct)}%` }}
              />
            </div>
            <span
              className={cn(
                "text-[9px] font-mono tabular-nums",
                h === currentHour ? "text-primary" : "text-muted-foreground",
              )}
            >
              {h}
            </span>
          </div>
        );
      })}
    </div>
  );
}
