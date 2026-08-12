import { AlertTriangle, Building2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMinutes } from "@/lib/liveStaff";
import type { CityKpi } from "@/lib/staffKpi";

/** Nyckeltal grupperade per stad — samma stad-fält som filtret använder. */
export function CityKpiCards({ cities }: { cities: CityKpi[] }) {
  if (cities.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Per stad</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cities.map((c) => (
          <Card key={c.city} className="shadow-card">
            <CardContent className="p-3">
              <p className="flex items-center gap-1 truncate text-[10px] font-medium text-foreground">
                <Building2 className="h-3 w-3 text-primary" /> {c.city}
                <span className="text-muted-foreground">· {c.stores} enheter</span>
              </p>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">På plats</p>
                  <p className="text-base font-heading font-bold tabular-nums text-foreground">{c.workingNow}</p>
                </div>
                <div>
                  <p className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <AlertTriangle className="h-2.5 w-2.5" /> Avvik.
                  </p>
                  <p
                    className={`text-base font-heading font-bold tabular-nums ${
                      c.deviations > 0 ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {c.deviations}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" /> Arbetad
                  </p>
                  <p className="text-xs font-heading font-bold tabular-nums text-foreground">
                    {formatMinutes(c.workedMinutes)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
