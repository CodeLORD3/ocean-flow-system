import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, AlertTriangle, Radio } from "lucide-react";
import { usePkClockedInNow, pkHours, type PkClockedInRow } from "@/hooks/usePersonalkollen";

const STATUS_LABEL: Record<string, string> = {
  on_time: "Enligt schema",
  late: "Sen instämpling",
  early: "Tidig instämpling",
  unscheduled: "Utan planerat pass",
  overtime: "Arbetar efter passets slut",
};

function statusVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "unscheduled" || status === "late") return "destructive";
  if (status === "overtime") return "secondary";
  return "outline";
}

function clockLabel(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * På plats nu — vilka som står instämplade i Personalkollen just nu,
 * grupperat på butik via kostnadsgruppernas mappning.
 */
export default function PkOnSiteNow() {
  const { data: rows, isLoading } = usePkClockedInNow();

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: PkClockedInRow[] }>();
    (rows ?? []).forEach((r) => {
      const key = r.store_id ?? `okänd:${r.costgroup_name ?? r.workplace_name ?? "—"}`;
      const label = r.store_name ?? r.costgroup_name ?? r.workplace_name ?? "Ej mappad enhet";
      const g = map.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "sv"));
  }, [rows]);

  const total = rows?.length ?? 0;
  const deviations = (rows ?? []).filter((r) => r.status === "late" || r.status === "unscheduled").length;
  const unmapped = (rows ?? []).filter((r) => !r.store_id).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">På plats nu</h1>
          <p className="text-sm text-muted-foreground">
            Instämplad personal från Personalkollen, uppdaterad varje minut.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Radio className="h-3 w-3 text-primary" /> LIVE
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> På plats nu
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> Avvikelser
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{deviations}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" /> Utan butiksmappning
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{unmapped}</CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ingen är instämplad just nu.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.label}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{g.label}</span>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {g.rows.length} på plats
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Person</th>
                      <th className="px-4 py-2 text-left font-medium">Instämplad</th>
                      <th className="px-4 py-2 text-left font-medium">Planerat pass</th>
                      <th className="px-4 py-2 text-left font-medium">Arbetad tid</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={`${r.staff_url}-${r.clocked_in_at}`} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {r.display_name ?? "Okänd"}
                          {r.is_guest ? (
                            <Badge variant="secondary" className="ml-2">Gäst</Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums">{clockLabel(r.clocked_in_at)}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">
                          {r.scheduled_start
                            ? `${clockLabel(r.scheduled_start)}–${clockLabel(r.scheduled_end)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums">{pkHours(r.ongoing_seconds)}</td>
                        <td className="px-4 py-2">
                          <Badge variant={statusVariant(r.status)}>
                            {STATUS_LABEL[r.status ?? ""] ?? r.status ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
