import { useState } from "react";
import { Lightbulb, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { minutesText, PART_LABELS, partsSum, standardParts } from "@/lib/taskStandardTime";
import { useTaskCheckpoints, useTaskTimeStats } from "@/hooks/useTaskRun";
import { useCreateImprovement, type ResolvedNeed } from "@/hooks/useResources";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useTaskRoute } from "@/hooks/useTaskRoute";
import { TaskRoute } from "@/components/tasks/TaskRoute";
import { StandardRouteEditor } from "@/components/tasks/StandardRouteEditor";

type PlanningTask = {
  id: string;
  task: string;
  template_item_id?: string | null;
  estimated_minutes?: number | null;
  std_fetch_minutes?: number | null;
  std_prepare_minutes?: number | null;
  std_do_minutes?: number | null;
  std_check_minutes?: number | null;
  std_restore_minutes?: number | null;
};

/**
 * PLANERING — utrustning med plats, vägen i butiken, standardtidens delar och
 * uppföljning. Här ställer vi frågan varför arbetet tar längre tid än standard,
 * och kan skapa ett förbättringsförslag. Systemet ändrar aldrig något själv.
 */
export function TaskPlanningPanel({
  task,
  storeId,
  area,
  needs,
  zoneName,
  onShowOnMap,
  onShowRoute,
}: {
  task: PlanningTask;
  storeId: string | null;
  area?: { id: string; name: string } | null;
  needs: ResolvedNeed[];
  zoneName: (zoneId: string | null) => string | null;
  onShowOnMap?: (zoneId: string) => void;
  onShowRoute?: (zoneIds: string[]) => void;
}) {
  const parts = standardParts(task);
  const sum = partsSum(parts);
  const stats = useTaskTimeStats(storeId, task.task);
  const createImprovement = useCreateImprovement();
  const { staff } = useStaffAuth();
  const [observation, setObservation] = useState("");
  const [open, setOpen] = useState(false);

  const std = sum ?? task.estimated_minutes ?? null;
  const slower = std !== null && stats.data?.average ? stats.data.average > std * 1.1 : false;

  const { data: checkpoints = [] } = useTaskCheckpoints(task.template_item_id ?? null);
  const { route, calculated, standard, usingStandard, drift } = useTaskRoute({
    storeId,
    templateItemId: task.template_item_id ?? null,
    area: area ?? null,
    taskName: task.task,
    needs,
    checkpoints: checkpoints.map((c) => c.label),
    minutes: { do: parts.doWork, check: parts.check },
  });

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Utrustning och material</h3>
        {needs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga krav är inlagda på uppgiften ännu. Lägg in dem under Inställningar.
          </p>
        ) : (
          <div className="space-y-2">
            {needs.map((n) => (
              <div key={n.requirement.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{n.requirement.requirement_name}</span>
                {n.resource && <span className="text-muted-foreground">{n.resource.name}</span>}
                {n.place && <span className="text-muted-foreground">· {n.place}</span>}
                {!n.resource && <span className="text-xs text-amber-700">butikens sak är inte vald</span>}
                {n.zoneId && onShowOnMap && (
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => onShowOnMap(n.zoneId!)}>
                    <MapPin className="mr-1 h-3.5 w-3.5" /> {zoneName(n.zoneId) ?? "Visa på kartan"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <TaskRoute
        route={route}
        alternative={calculated}
        usingStandard={usingStandard}
        drift={drift}
        totals={{ work: parts.doWork, prepare: parts.prepare, check: parts.check, restore: parts.restore }}
        onShowOnMap={
          onShowRoute
            ? () => onShowRoute(route.stops.map((s) => s.zoneId).filter((z): z is string => !!z))
            : undefined
        }
      />

      <StandardRouteEditor
        route={calculated}
        standard={standard}
        templateItemId={task.template_item_id ?? null}
        storeId={storeId}
      />

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Standardtid</h3>
        <div className="space-y-1 font-mono text-sm tabular-nums">
          {PART_LABELS.map((p) => (
            <div key={p.key} className="flex justify-between">
              <span className="font-sans text-muted-foreground">{p.label}</span>
              <span>{minutesText(parts[p.key]) ?? "—"}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span className="font-sans">Standardtid</span>
            <span>{minutesText(std) ?? "—"}</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Uppföljning</h3>
        {stats.data && stats.data.count > 0 ? (
          <div className="space-y-1 font-mono text-sm tabular-nums">
            <p>
              <span className="font-sans text-muted-foreground">Snitt senaste {stats.data.count}: </span>
              {minutesText(stats.data.average)}
            </p>
            <p>
              <span className="font-sans text-muted-foreground">Kortaste: </span>
              {minutesText(stats.data.fastest)}
            </p>
            {!!stats.data.waiting && (
              <p>
                <span className="font-sans text-muted-foreground">Väntetid i snitt: </span>
                {minutesText(stats.data.waiting)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen mätt tid ännu. Tiderna samlas när uppgiften startas.</p>
        )}

        {slower && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            <Lightbulb className="mr-1 inline h-4 w-4" />
            Arbetet tar längre tid än standard. Vad i arbetssättet gör det svårare?
          </p>
        )}

        <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen((v) => !v)}>
          Skapa förbättringsförslag
        </Button>
        {open && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Vad har du sett, och vad skulle göra arbetet enklare?"
              className="min-h-[70px]"
            />
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await createImprovement.mutateAsync({
                    storeId,
                    templateItemId: task.template_item_id ?? null,
                    checklistItemId: task.id,
                    observation,
                    staffId: staff?.id ?? null,
                  });
                  setObservation("");
                  setOpen(false);
                  toast({ title: "Förslaget är skickat", description: "En ansvarig beslutar om ändringen." });
                } catch (e: any) {
                  toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
                }
              }}
            >
              Skicka förslag
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
