import { Receipt, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDailyReport, formatWeekdayDate, todayIso } from "@/hooks/useDailyReport";

/** Kompakt klickbart kort för dagsrapporten i butiksportalens Översikt. */
export function DailyReportCard({ storeId, onOpenFull }: { storeId: string; onOpenFull?: () => void }) {
  const date = todayIso();
  const { data: report, isLoading } = useDailyReport(storeId, date);

  const savedAt = report?.updated_at || report?.created_at;
  const time = savedAt
    ? new Date(savedAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpenFull}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenFull?.();
        }
      }}
      className={cn(
        "shadow-card cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col justify-between gap-2 p-3 md:aspect-square md:p-5",
        report && "border-emerald-600/50 bg-emerald-500/5",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="rounded-md bg-muted p-1.5 md:p-2">
          <Receipt className={cn("h-5 w-5 md:h-6 md:w-6", report ? "text-emerald-500" : "text-primary")} />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </div>

      <div>
        <h3 className="font-heading text-base md:text-lg text-foreground">Dagsrapport</h3>
        <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{formatWeekdayDate(date)}</p>
      </div>

      <div>
        {isLoading ? (
          <span className="text-[11px] md:text-xs text-muted-foreground">Laddar…</span>
        ) : report ? (
          <span className="inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] md:text-xs font-medium text-emerald-500">
            Skickad kl. {time}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] md:text-xs font-medium text-amber-500">
            Ej ifylld idag
          </span>
        )}
      </div>
    </Card>
  );
}
