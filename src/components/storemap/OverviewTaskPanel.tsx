import { useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusRing } from "@/components/storemap/StatusRing";
import { progressFor } from "@/lib/mapStatus";
import { WORK_TYPES, workTypeColor, workTypeLabel, workTypeOf } from "@/lib/workType";
import { useToggleChecklistItem } from "@/hooks/useChecklist";
import { useUploadEntityImage } from "@/hooks/useEntityImages";
import type { MapObject, MapTask, MapZone } from "@/hooks/useStoreMap";

type DoneFilter = "kvar" | "klara" | "allt";

const tid = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Dagens uppgifter i Översikt. Samma rader som checklistsidan — bockar man av
 * här ändras samma post. Uppgifter kopplade till en yta får ytans färg, och
 * bilder man tar från en uppgift sparas på ytan tillsammans med uppgiften.
 */
export function OverviewTaskPanel({
  storeId,
  planId,
  zones,
  objects,
  tasks,
  day,
  onDayChange,
  onOpenZone,
  onOpenTask,
  lockedZoneId,
}: {
  storeId: string;
  planId?: string | null;
  zones: MapZone[];
  objects: MapObject[];
  tasks: MapTask[];
  day: string;
  onDayChange?: (iso: string) => void;
  onOpenZone?: (zoneId: string) => void;
  /** Öppnar uppgiftens egen sida. */
  onOpenTask?: (taskId: string) => void;
  /** Sätts på en ytas egen sida — då visas bara den ytans uppgifter. */
  lockedZoneId?: string | null;
}) {
  const toggle = useToggleChecklistItem();
  const upload = useUploadEntityImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingTask, setPendingTask] = useState<MapTask | null>(null);
  const [zonePick, setZonePick] = useState<{ task: MapTask; file: File } | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>(lockedZoneId ?? "alla");
  const [typeFilter, setTypeFilter] = useState<string>("alla");
  const [doneFilter, setDoneFilter] = useState<DoneFilter>("kvar");
  const [open, setOpen] = useState(true);

  const zoneMeta = useMemo(() => {
    const map: Record<string, { name: string; color: string; nr: number }> = {};
    zones.forEach((z, i) => {
      map[z.id] = { name: z.name, color: z.color ?? "#1f4d6b", nr: i + 1 };
    });
    return map;
  }, [zones]);

  /** Objekt ärver sin yta, så en uppgift på en kyl hamnar i rätt område. */
  const zoneOfObject = useMemo(
    () => Object.fromEntries(objects.map((o) => [o.id, o.zone_id])) as Record<string, string | null>,
    [objects],
  );

  const zoneIdOf = (t: MapTask) => t.zone_id ?? (t.map_object_id ? zoneOfObject[t.map_object_id] ?? null : null);

  const enriched = useMemo(
    () => tasks.map((t) => ({ task: t, zoneId: zoneIdOf(t), type: workTypeOf(t) })),
    [tasks, zoneOfObject],
  );

  const scoped = useMemo(
    () => (lockedZoneId ? enriched.filter((r) => r.zoneId === lockedZoneId) : enriched),
    [enriched, lockedZoneId],
  );

  const zoneCounts = useMemo(() => {
    const m: Record<string, number> = {};
    scoped.forEach((r) => {
      const key = r.zoneId ?? "ingen";
      m[key] = (m[key] ?? 0) + 1;
    });
    return m;
  }, [scoped]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    scoped.forEach((r) => {
      m[r.type] = (m[r.type] ?? 0) + 1;
    });
    return m;
  }, [scoped]);

  const rows = useMemo(
    () =>
      scoped.filter((r) => {
        if (zoneFilter === "ingen" && r.zoneId) return false;
        if (zoneFilter !== "alla" && zoneFilter !== "ingen" && r.zoneId !== zoneFilter) return false;
        if (typeFilter !== "alla" && r.type !== typeFilter) return false;
        if (doneFilter === "kvar" && r.task.done) return false;
        if (doneFilter === "klara" && !r.task.done) return false;
        return true;
      }),
    [scoped, zoneFilter, typeFilter, doneFilter],
  );

  const progress = progressFor(scoped.map((r) => r.task), 0);

  async function saveImage(task: MapTask, file: File, zoneId: string | null) {
    const objectId = task.map_object_id;
    const entityType = objectId ? "map_object" : "map_zone";
    const entityId = objectId ?? zoneId ?? "";
    if (!entityId) {
      toast.error("Välj vilket område bilden hör till.");
      return;
    }
    try {
      await upload.mutateAsync({
        entityType,
        entityId,
        file,
        caption: task.task,
        imageKind: "completion",
        floorPlanId: planId ?? null,
        checklistItemId: task.id,
      });
      toast.success("Bilden sparad på området");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ladda upp bilden");
    }
  }

  function onPickFile(files: FileList | null) {
    const file = files?.[0];
    const task = pendingTask;
    if (fileRef.current) fileRef.current.value = "";
    setPendingTask(null);
    if (!file || !task) return;
    const zoneId = zoneIdOf(task);
    if (!zoneId && !task.map_object_id) {
      setZonePick({ task, file });
      return;
    }
    void saveImage(task, file, zoneId);
  }

  const chip = (active: boolean, color?: string | null) =>
    cn(
      "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
      active ? "border-transparent text-white shadow-sm" : "border-border bg-card hover:bg-muted",
    );

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusRing percent={progress.percent} status={progress.status} size={38} label={`${progress.percent}%`} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> Dagens uppgifter
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {progress.done} av {progress.total} klara · {scoped.filter((r) => !r.task.done).length} kvar
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {onDayChange && (
            <Input
              type="date"
              value={day}
              onChange={(e) => onDayChange(e.target.value)}
              className="h-7 w-[9.5rem] text-xs"
            />
          )}
          <div className="flex rounded-full border border-border p-0.5">
            {(["kvar", "klara", "allt"] as DoneFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setDoneFilter(f)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] capitalize transition",
                  doneFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2 text-xs"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      {open && (
        <>
          {!lockedZoneId && (
            <div className="-mx-1 mb-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setZoneFilter("alla")}
                className={chip(zoneFilter === "alla")}
                style={zoneFilter === "alla" ? { background: "hsl(var(--primary))" } : undefined}
              >
                Alla områden <span className="tabular-nums opacity-70">{scoped.length}</span>
              </button>
              {zones.map((z) => {
                const active = zoneFilter === z.id;
                const color = z.color ?? "#1f4d6b";
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZoneFilter(active ? "alla" : z.id)}
                    onDoubleClick={() => onOpenZone?.(z.id)}
                    className={chip(active)}
                    style={active ? { background: color } : { borderColor: `${color}66`, color }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : color }} />
                    {zoneMeta[z.id]?.nr}. {z.name}
                    <span className="tabular-nums opacity-70">{zoneCounts[z.id] ?? 0}</span>
                  </button>
                );
              })}
              {(zoneCounts["ingen"] ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setZoneFilter(zoneFilter === "ingen" ? "alla" : "ingen")}
                  className={chip(zoneFilter === "ingen")}
                  style={zoneFilter === "ingen" ? { background: "#64748b" } : undefined}
                >
                  Ingen plats <span className="tabular-nums opacity-70">{zoneCounts["ingen"]}</span>
                </button>
              )}
            </div>
          )}

          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => setTypeFilter("alla")}
              className={chip(typeFilter === "alla")}
              style={typeFilter === "alla" ? { background: "hsl(var(--primary))" } : undefined}
            >
              Alla arbetstyper
            </button>
            {WORK_TYPES.filter((w) => (typeCounts[w.key] ?? 0) > 0).map((w) => {
              const active = typeFilter === w.key;
              return (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => setTypeFilter(active ? "alla" : w.key)}
                  className={chip(active)}
                  style={active ? { background: w.color } : { borderColor: `${w.color}66`, color: w.color }}
                >
                  {w.label} <span className="tabular-nums opacity-70">{typeCounts[w.key]}</span>
                </button>
              );
            })}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              {doneFilter === "kvar" ? "Allt är klart här — bra jobbat." : "Inga uppgifter matchar filtret."}
            </p>
          ) : (
            <div className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
              {rows.map(({ task: t, zoneId, type }) => {
                const meta = zoneId ? zoneMeta[zoneId] : null;
                const color = meta?.color ?? "#94a3b8";
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-2"
                    style={{ borderLeft: `4px solid ${color}` }}
                  >
                    <Checkbox
                      checked={t.done}
                      onCheckedChange={(v) => toggle.mutate({ id: t.id, done: !!v })}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(t.id)}
                        disabled={!onOpenTask}
                        className={cn(
                          "block w-full truncate text-left text-xs",
                          t.done ? "text-muted-foreground line-through" : "font-medium",
                          onOpenTask ? "hover:underline" : "cursor-default",
                        )}
                        title={onOpenTask ? "Öppna uppgiften" : undefined}
                      >
                        {t.task}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => zoneId && onOpenZone?.(zoneId)}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                          style={{ background: `${color}1f`, color }}
                          title={meta ? "Öppna området" : "Uppgiften saknar plats på kartan"}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                          {meta ? `${meta.nr}. ${meta.name}` : "Ingen plats"}
                        </button>
                        <span
                          className="rounded-full px-1.5 py-0.5"
                          style={{ background: `${workTypeColor(type)}1f`, color: workTypeColor(type) }}
                        >
                          {workTypeLabel(type)}
                        </span>
                        {t.time_label && <span className="tabular-nums">{t.time_label}</span>}
                        {t.done && <span className="tabular-nums">{t.signature ?? "—"} {tid(t.done_at)}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                      title="Ta en bild för uppgiften"
                      disabled={upload.isPending}
                      onClick={() => {
                        setPendingTask(t);
                        fileRef.current?.click();
                      }}
                    >
                      {upload.isPending && pendingTask?.id === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files)}
      />

      <Dialog open={!!zonePick} onOpenChange={(o) => !o && setZonePick(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Var togs bilden?</DialogTitle>
            <DialogDescription className="text-xs">
              Uppgiften saknar plats på kartan. Välj område så hamnar bilden rätt.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  const pick = zonePick;
                  setZonePick(null);
                  if (pick) void saveImage(pick.task, pick.file, z.id);
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? "#1f4d6b" }} />
                {zoneMeta[z.id]?.nr}. {z.name}
              </button>
            ))}
            {zones.length === 0 && (
              <p className="text-xs text-muted-foreground">Butiken har inga ytor på kartan ännu.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
