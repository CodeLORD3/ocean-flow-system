import { useEffect, useMemo, useState } from "react";
import { Check, Maximize2, Minimize2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";
import { centroid, toPath, zonePoints } from "@/lib/mapGeometry";
import type { TaskRowArea } from "@/components/tasks/TaskRow";
import type { TaskRow as Task } from "@/hooks/useTasks";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: FloorPlan | null;
  zones: MapZone[];
  areas: Map<string, TaskRowArea>;
  /** Dagens uppgifter — panelen visar dem som hör till valt område. */
  tasks: Task[];
  /** Området panelen är öppnad på; null = hela butiken. */
  zoneId: string | null;
  onZoneChange: (zoneId: string | null) => void;
  /** Öppnar områdets egen sida i butikskartan. */
  onOpenArea: (zoneId: string) => void;
  /** Öppnar en uppgift. */
  onOpenTask: (taskId: string) => void;
};

/**
 * Kartan som hjälp till uppgifterna: glider in från höger, visar var uppgiften
 * ska göras och vilka uppgifter som hör till området. Uppgiftssidan bakom
 * ligger kvar orörd.
 */
export function TaskMapDrawer({
  open,
  onOpenChange,
  plan,
  zones,
  areas,
  tasks,
  zoneId,
  onZoneChange,
  onOpenArea,
  onOpenTask,
}: Props) {
  const shapes = useMemo(
    () =>
      [...zones]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((z) => {
          const pts = zonePoints(z);
          return { zone: z, pts, path: toPath(pts), mid: centroid(pts), area: areas.get(z.id) ?? null };
        }),
    [zones, areas],
  );

  const countOf = (id: string) => {
    const list = tasks.filter((t) => t.zone_id === id);
    return { total: list.length, done: list.filter((t) => t.done).length, list };
  };

  /** Zooma ut: visar hela butiken utan att tappa valt område. */
  const [wholeStore, setWholeStore] = useState(false);
  useEffect(() => setWholeStore(false), [zoneId]);

  /** Kartan centreras på valt område, annars på hela butiken. */
  const view = useMemo(() => {
    const target = zoneId && !wholeStore ? shapes.filter((s) => s.zone.id === zoneId) : shapes;
    const pts = (target.length > 0 ? target : shapes).flatMap((s) => s.pts);
    if (pts.length === 0) return { x: 0, y: 0, w: plan?.width ?? 1000, h: plan?.height ?? 700 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const pad = Math.max(40, Math.max(w, h) * 0.1);
    let vw = w + pad * 2;
    let vh = h + pad * 2;
    // Smala ytor får en rimlig ruta så kartan inte klipps hårt.
    vw = Math.max(vw, vh * 1.2);
    vh = Math.max(vh, vw * 0.6);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
  }, [shapes, zoneId, wholeStore, plan?.width, plan?.height]);

  const current = zoneId ? shapes.find((s) => s.zone.id === zoneId) ?? null : null;
  const c = current ? countOf(current.zone.id) : null;
  const allTotal = tasks.filter((t) => t.zone_id).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[65vw] lg:max-w-[45vw]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl font-semibold">
              {current ? current.zone.name : "Butikskarta"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {current && c
                ? `Område ${current.area?.number ?? "–"} · ${c.done} av ${c.total} uppgifter klara`
                : `${shapes.length} områden · ${allTotal} uppgifter`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Stäng kartan"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {plan && shapes.length > 0 ? (
          <>
            <div className="relative bg-muted/20">
              {/* Zooma ut för att se var i butiken området ligger */}
              {zoneId && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute right-3 top-3 z-10 h-9 gap-1.5 shadow"
                  onClick={() => setWholeStore((v) => !v)}
                >
                  {wholeStore ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {wholeStore ? "Zooma in på området" : "Zooma ut · hela butiken"}
                </Button>
              )}
              <svg
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                className="h-[58vh] max-h-[640px] min-h-[320px] w-full"
                role="img"
                aria-label="Butikskartan"
              >
                {plan.background_url && (
                  <image
                    href={plan.background_url}
                    x={plan.background_x}
                    y={plan.background_y}
                    width={plan.width * plan.background_scale}
                    height={plan.height * plan.background_scale}
                    opacity={plan.background_opacity * 0.4}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                {shapes.map(({ zone, path, mid, area }) => {
                  const isSel = zoneId === zone.id;
                  const dimmed = !!zoneId && !isSel;
                  const color = area?.color ?? "hsl(var(--primary))";
                  const zc = countOf(zone.id);
                  return (
                    <g
                      key={zone.id}
                      className="cursor-pointer"
                      onClick={() => onZoneChange(isSel ? null : zone.id)}
                      opacity={dimmed ? 0.35 : 1}
                    >
                      <polygon
                        points={path}
                        fill={color}
                        fillOpacity={isSel ? 0.55 : 0.18}
                        stroke={color}
                        strokeWidth={isSel ? 5 : 2}
                      />
                      <text
                        x={mid.x}
                        y={mid.y}
                        textAnchor="middle"
                        className="fill-foreground text-[15px] font-semibold"
                        stroke="hsl(var(--card))"
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {zone.name}
                      </text>
                      {zc.total > 0 && (
                        <text
                          x={mid.x}
                          y={mid.y + 20}
                          textAnchor="middle"
                          className="fill-muted-foreground text-[13px]"
                          stroke="hsl(var(--card))"
                          strokeWidth={4}
                          paintOrder="stroke"
                        >
                          {zc.done} av {zc.total} klara
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="space-y-3 px-5 py-4">
              {current && c ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold">{c.total} uppgifter</p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {c.done} klara · {c.total - c.done} kvar
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {c.list.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(t.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                              t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                            )}
                          >
                            {t.done && <Check className="h-3 w-3" />}
                          </span>
                          <span className={cn("truncate", t.done && "text-muted-foreground line-through")}>
                            {t.task}
                          </span>
                        </button>
                      </li>
                    ))}
                    {c.list.length === 0 && (
                      <li className="py-3 text-sm text-muted-foreground">Inga uppgifter på området idag.</li>
                    )}
                  </ul>
                  <Button variant="outline" className="w-full" onClick={() => onOpenArea(current.zone.id)}>
                    Öppna området
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tryck på ett område på kartan för att se dess uppgifter.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Butiken har ingen karta ännu.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
