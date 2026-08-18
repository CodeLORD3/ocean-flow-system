import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { LiveStoreRow } from "@/hooks/useLiveStaff";
import { staffName } from "@/hooks/useLiveStaff";

function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}

interface Props {
  rows: LiveStoreRow[];
  staffById: Map<string, any>;
  /** Bolagsnamn per legal_entity_id, för rubriken. */
  entityNames?: Map<string, string>;
}

/**
 * Administration och annan overhead visas som egen grupp per bolag och räknas
 * aldrig in i någon butiks personalkostnad eller kr/timme.
 */
export function OverheadGroups({ rows, staffById, entityNames }: Props) {
  if (rows.length === 0) return null;

  const byEntity = new Map<string, LiveStoreRow[]>();
  rows.forEach((r) => {
    const key = r.legalEntityId ?? "—";
    byEntity.set(key, [...(byEntity.get(key) ?? []), r]);
  });

  return (
    <div className="space-y-2">
      {Array.from(byEntity.entries()).map(([entity, units]) => (
        <Card key={entity} className="shadow-card">
          <CardContent className="space-y-2 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" />
              Administration · {entityNames?.get(entity) ?? entity}
              <Badge variant="outline" className="ml-1 text-[10px]">
                Overhead — ingår ej i butikernas personalkostnad
              </Badge>
            </p>

            {units.map((u) => (
              <div key={u.id} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{u.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{u.workingNow}</span> i arbete nu ·{" "}
                    <span className="font-mono tabular-nums">{hhmm(u.workedMinutes)}</span> registrerat
                  </p>
                </div>

                {u.staffRows.length === 0 ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">Inga stämplingar eller planerade pass.</p>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {u.staffRows.map((sr) => (
                      <div key={sr.staffId} className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-medium text-foreground">{staffName(staffById, sr.staffId)}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            sr.status === "working" ? "border-emerald-500/40 text-emerald-600" : ""
                          }`}
                        >
                          {sr.status === "working" ? "Instämplad" : "Avslutat"}
                        </Badge>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {hhmm(sr.workedMinutes)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
