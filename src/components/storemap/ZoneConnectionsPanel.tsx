import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useSaveZoneConnection, useSetZoneConnectionActive, useZoneConnections } from "@/hooks/useZoneConnections";
import type { MapZone } from "@/hooks/useStoreMap";

/**
 * Gångvägar mellan områden: hur lång tid och hur många meter det är att gå
 * mellan två delar av butiken. Används för att räkna ut uppgifternas arbetsväg.
 */
export function ZoneConnectionsPanel({
  storeId,
  floorPlanId,
  zones,
  selectedZoneId,
}: {
  storeId: string | null;
  floorPlanId: string | null;
  zones: MapZone[];
  selectedZoneId: string | null;
}) {
  const { data: connections = [] } = useZoneConnections(storeId);
  const save = useSaveZoneConnection();
  const setActive = useSetZoneConnectionActive();
  const [toZone, setToZone] = useState<string | null>(null);
  const [seconds, setSeconds] = useState("");
  const [meters, setMeters] = useState("");

  const from = zones.find((z) => z.id === selectedZoneId) ?? null;
  const name = (id: string) => zones.find((z) => z.id === id)?.name ?? "Område";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">Gångvägar mellan områden</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!from ? (
          <p className="text-xs text-muted-foreground">Välj ett område i kartan för att koppla det till ett annat.</p>
        ) : (
          <>
            <p className="text-xs font-medium">Från {from.name} till:</p>
            <div className="flex flex-wrap gap-1">
              {zones
                .filter((z) => z.id !== from.id)
                .map((z) => (
                  <Button
                    key={z.id}
                    size="sm"
                    variant={toZone === z.id ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setToZone(z.id)}
                  >
                    {z.name}
                  </Button>
                ))}
            </div>
            {toZone && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Sekunder att gå</Label>
                  <Input
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                    inputMode="numeric"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Meter</Label>
                  <Input
                    value={meters}
                    onChange={(e) => setMeters(e.target.value)}
                    inputMode="decimal"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  className="col-span-2 h-8 text-xs"
                  onClick={async () => {
                    if (!storeId) return;
                    try {
                      await save.mutateAsync({
                        storeId,
                        floorPlanId,
                        fromZoneId: from.id,
                        toZoneId: toZone,
                        walkSeconds: seconds ? Number(seconds.replace(",", ".")) : null,
                        distanceMeters: meters ? Number(meters.replace(",", ".")) : null,
                      });
                      setSeconds("");
                      setMeters("");
                      toast({ title: "Gångvägen är sparad" });
                    } catch (e) {
                      toast({
                        title: "Kunde inte spara",
                        description: (e as Error).message,
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Spara gångväg
                </Button>
              </div>
            )}
          </>
        )}

        {connections.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate">
                  {name(c.from_zone_id)} → {name(c.to_zone_id)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {[c.walk_seconds ? `${c.walk_seconds} s` : null, c.distance_meters ? `${c.distance_meters} m` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setActive.mutate({ id: c.id, active: !c.active })}
                >
                  {c.active ? "Dölj" : "Visa"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
