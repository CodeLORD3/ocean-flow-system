import { useEffect, useState } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PURPOSE_LABEL, type RouteStop, type WorkRoute } from "@/lib/taskRoute";
import { useSaveStandardRoute } from "@/hooks/useStandardRoute";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import type { StandardRoute } from "@/lib/taskRoute";

/**
 * Systemet föreslår, vi bestämmer. Här väljer en ansvarig om vägen ska räknas
 * fram automatiskt eller följa butikens egen ordning — och flyttar stoppen.
 * Butikskartan ändras aldrig av detta.
 */
export function StandardRouteEditor({
  route,
  standard,
  templateItemId,
  storeId,
}: {
  route: WorkRoute;
  standard: StandardRoute | null;
  templateItemId: string | null;
  storeId: string | null;
}) {
  const save = useSaveStandardRoute();
  const { staff } = useStaffAuth();
  const [mode, setMode] = useState<"calculated" | "standard">(standard?.route_mode ?? "calculated");
  const [stops, setStops] = useState<RouteStop[]>(route.stops);
  const [dragKey, setDragKey] = useState<string | null>(null);

  useEffect(() => setStops(route.stops), [route.stops]);
  useEffect(() => setMode(standard?.route_mode ?? "calculated"), [standard?.route_mode]);

  if (!templateItemId || !storeId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Vägen kan sparas som standard när uppgiften hör till en standarduppgift.
      </Card>
    );
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length) return;
    const next = [...stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setStops(next);
  };

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">Väg i butiken</h3>
      <div className="space-y-2">
        {(["calculated", "standard"] as const).map((m) => (
          <label key={m} className="flex min-h-[48px] items-center gap-3 rounded-lg border px-3 text-sm">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} className="h-4 w-4" />
            {m === "calculated" ? "Beräkna automatiskt" : "Använd vår standardväg"}
          </label>
        ))}
      </div>

      {mode === "standard" && (
        <ol className="space-y-1">
          {stops.map((s, i) => (
            <li
              key={s.key}
              draggable
              onDragStart={() => setDragKey(s.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragKey) return;
                move(stops.findIndex((x) => x.key === dragKey), i);
                setDragKey(null);
              }}
              className="flex items-center gap-2 rounded-lg border p-2 text-sm"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-semibold">{i + 1}</span>
              <span className="min-w-0 flex-1">
                {s.zoneName ?? "Område saknas"} — {PURPOSE_LABEL[s.purpose]}: {s.items.join(", ")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => move(i, i - 1)} aria-label="Flytta upp">
                ↑
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(i, i + 1)} aria-label="Flytta ned">
                ↓
              </Button>
            </li>
          ))}
        </ol>
      )}

      <Button
        size="lg"
        onClick={async () => {
          try {
            await save.mutateAsync({
              templateItemId,
              storeId,
              routeMode: mode,
              stops,
              totalMeters: route.totalMeters,
              walkSeconds: route.walkSeconds,
              staffId: staff?.id ?? null,
              currentVersion: standard?.version ?? 0,
            });
            toast({
              title: mode === "standard" ? "Standardvägen är sparad" : "Vägen räknas fram automatiskt",
            });
          } catch (e: any) {
            toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
          }
        }}
      >
        {mode === "standard" ? "Spara som standardväg" : "Spara val"}
      </Button>
    </Card>
  );
}
