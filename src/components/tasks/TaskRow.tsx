import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, Check, ChevronDown, ChevronRight, Clock, ImageIcon, MapPin, Play, Timer, Trash2, User, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import { durationText, taskTime } from "@/lib/taskTime";
import { missingRequirements, missingText, valueLabel } from "@/lib/taskRequirements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workTypeLabel } from "@/lib/workType";
import { useTaskImages, useTaskBlueprint, type TaskRow as Task } from "@/hooks/useTasks";
import { TaskRunFullscreen } from "@/components/tasks/TaskRunFullscreen";
import { parseGuide } from "@/lib/taskGuide";
import { useStartTask, useFinishTask } from "@/hooks/useTaskRun";
import { TaskPrepPanel } from "@/components/tasks/TaskPrepPanel";
import { useTaskPrepChecks } from "@/hooks/useTaskPrep";
import {
  resolveNeeds,
  useResourceItems,
  useResourceLocations,
  useStoreResourceMappings,
  useTaskRequirements,
} from "@/hooks/useResources";
import { toast } from "@/hooks/use-toast";

export type TaskRowArea = { id: string; name: string; color: string; number: number } | null;

type Props = {
  task: Task;
  area: TaskRowArea;
  categoryName?: string | null;
  categoryColor?: string | null;
  assigneeName?: string | null;
  assigneeImage?: string | null;
  completedByName?: string | null;
  completedByImage?: string | null;
  photoCount?: number;
  onToggle: (done: boolean) => void;
  onOpenDetail: () => void;
  onAddPhoto?: (file: File) => void;
  onOpenArea?: (areaId: string) => void;
  onDelete?: () => void;
  /** Genväg dit arbetet görs (dagsrapport, checklista, recept …). */
  linkLabel?: string | null;
  onOpenLink?: () => void;
  /** Sparar det som krävs för att få bocka av (kommentar/mätvärde). */
  onSaveRequirement?: (patch: { completion_note?: string | null; completion_value?: number | null }) => void;
  /** Sätts när antalet bilder är känt — då spärras även bildkravet. */
  photoCountKnown?: boolean;
  /** Personer som kan få uppgiften. Visas som snabb tilldelning i rulldownen. */
  staffOptions?: { id: string; name: string; imageUrl?: string | null }[];
  /** Butiken uppgiften hör till — behövs för utrustning & material. */
  storeId?: string | null;
  onAssign?: (staffId: string | null) => void;
  /** Sätts när man kommit tillbaka hit: raden öppnas och lyser upp en stund. */
  focused?: boolean;
};

/**
 * En ren rad i listan. Klick öppnar en rulldown med det man behöver för att
 * göra uppgiften nu; allt annat ligger på uppgiftens egen sida.
 */
export function TaskRow({
  task,
  area,
  categoryName,
  categoryColor,
  assigneeName,
  assigneeImage,
  completedByName,
  completedByImage,
  photoCount = 0,
  onToggle,
  onOpenDetail,
  onAddPhoto,
  onOpenArea,
  onDelete,
  linkLabel,
  onOpenLink,
  onSaveRequirement,
  photoCountKnown,
  staffOptions,
  onAssign,
  storeId = null,
  focused = false,
}: Props) {
  const [open, setOpen] = useState(false);
  /* Tillbaka från uppgiftssidan: raden fälls ut igen där man var. */
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);
  const [noteDraft, setNoteDraft] = useState(task.completion_note ?? "");
  const [valueDraft, setValueDraft] = useState(
    task.completion_value === null || task.completion_value === undefined ? "" : String(task.completion_value),
  );
  const time = taskTime(task);

  /* Ny rad på nytt datum utan beskrivning: ärv steg och utrustning från samma uppgift. */
  const ownGuideSteps = parseGuide(task.guide, task.instructions).steps.filter((s) => s.text || s.image);
  const { data: blueprint } = useTaskBlueprint(task.task, ownGuideSteps.length === 0);
  /* Utrustning & material — samma kontroll som på uppgiftens egen sida */
  const { data: ownRequirements = [] } = useTaskRequirements(task.template_item_id ?? null, task.id);
  const { data: inheritedRequirements = [] } = useTaskRequirements(
    null,
    ownRequirements.length === 0 && blueprint?.sourceId ? blueprint.sourceId : null,
  );
  const requirements = ownRequirements.length > 0 ? ownRequirements : inheritedRequirements;
  const { data: resourceItems = [] } = useResourceItems();
  const { data: resourceLocations = [] } = useResourceLocations(storeId);
  const { data: resourceMappings = [] } = useStoreResourceMappings(storeId);
  const needs = resolveNeeds(requirements, resourceMappings, resourceItems, resourceLocations);
  const { data: prepChecks = [] } = useTaskPrepChecks(task.id);
  const prepCheckedIds = new Set(prepChecks.map((c) => c.requirement_id ?? ""));
  const prepMissingCount = needs.filter((nd) => !prepCheckedIds.has(nd.requirement.id)).length;
  const duration = durationText(task.estimated_minutes);
  const accent = area?.color ?? categoryColor ?? "hsl(var(--muted-foreground))";
  /**
   * Kräver uppgiften en bild räknar raden själv bilderna, så den inte kan bockas
   * av utan bild även när listan inte skickat med antalet.
   */
  const needsOwnCount = !photoCountKnown && !!task.requires_photo && !task.done;
  const { data: ownImages } = useTaskImages(needsOwnCount ? task.id : null);
  const effectivePhotoCount = photoCountKnown ? photoCount : (ownImages?.length ?? photoCount);
  const countKnown = !!photoCountKnown || (needsOwnCount && ownImages !== undefined);
  const photoMissing = task.requires_photo && effectivePhotoCount === 0;
  const missing = missingRequirements(task, { photoCount: effectivePhotoCount, checkPhoto: countKnown });
  const blocked = !task.done && missing.length > 0;
  const start = useStartTask();
  const finish = useFinishTask();
  /* Öppna uppgiftssidan på rätt flik: historik, instruktion eller inställningar. */
  const openDetailAt = (tab: string) => {
    try {
      sessionStorage.setItem("task-detail-tab", tab);
      /* Minns raden så man kommer tillbaka till exakt samma öppna uppgift. */
      sessionStorage.setItem("uppgifter-focus-task", task.id);
    } catch {
      /* ignorera blockerad lagring */
    }
    onOpenDetail();
    /* Uppgiftssidan kan redan vara monterad (flikar hålls vid liv) — berätta vilken flik som ska visas. */
    window.dispatchEvent(new CustomEvent("task-detail-tab", { detail: { taskId: task.id, tab } }));
  };
  const running = task.run_status === "pagar";
  const canStart = !task.done && !running;
  const [showRun, setShowRun] = useState(false);
  const runRef = useRef<HTMLDivElement | null>(null);
  const inheritedSteps = blueprint
    ? parseGuide(blueprint.guide, blueprint.instructions).steps.filter((s) => s.text || s.image)
    : [];
  const guideSteps = ownGuideSteps.length > 0 ? ownGuideSteps : inheritedSteps;
  /** Starta/fortsätt uppgiften — arbetet fälls ut här i raden. */
  const startNow = async () => {
    setOpen(true);
    setShowRun(true);
    if (canStart) {
      await start.mutateAsync(task.id);
      toast({ title: "Uppgiften är startad", description: "Bocka av stegen ett i taget." });
    }
    if (guideSteps.length === 0) {
      onOpenDetail();
      return;
    }
    /** Rulla fram stegen så man ser dem direkt. */
    setTimeout(() => runRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };
  const tryToggle = (done: boolean) => {
    if (done && blocked) {
      setOpen(true);
      return;
    }
    onToggle(done);
  };

  return (
    <div
      id={`task-row-${task.id}`}
      className={cn(
        "relative overflow-hidden border-x border-b border-grid-line bg-card transition-all duration-200",
        task.done && "bg-emerald-500/10",
        photoMissing && !task.done && "bg-amber-500/5",
        open &&
          "z-10 my-3 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] to-primary/[0.02] pl-2.5 shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.55)]",
        focused && "animate-pulse ring-2 ring-primary ring-offset-2",
      )}
    >
      {/* Öppen uppgift: mjuk accentlinje längs hela kortets vänsterkant. */}
      {open && (
        <span
          className="pointer-events-none absolute bottom-2 left-1.5 top-2 w-1.5 rounded-full bg-primary/80"
          aria-hidden
        />
      )}
      <div className={cn("flex items-center gap-2 px-2", open ? "py-2" : "py-1 min-h-[34px]")}>
        {!open && (
          <span
            className="pointer-events-none absolute bottom-0 left-0 top-0 w-1"
            style={{ background: task.done ? "hsl(152 60% 42%)" : accent }}
            aria-hidden
          />
        )}
        {/* Kolumn 1: bocka av — samma kryssruta som i beställningar */}
        <span
          className={cn(
            "flex w-7 shrink-0 items-center justify-center self-stretch border-r border-grid-line",
            open && "border-transparent",
          )}
          title={blocked ? missingText(task, missing) : undefined}
        >
          <Checkbox
            checked={task.done}
            onCheckedChange={(v) => tryToggle(!!v)}
            aria-label={task.done ? "Återöppna uppgift" : "Markera som klar"}
            className="h-4 w-4 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
          />
        </span>


        {/* Kolumn 2: tid */}
        <span className="hidden w-[42px] shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground sm:block">
          {time.label || ""}
        </span>

        {/* Kolumn 3: uppgift */}
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-[7rem] flex-1 py-0.5 text-left">
          <span
            className={cn(
              "block break-words leading-snug",
              open
                ? "text-[17px] font-bold sm:text-[16px]"
                : "text-[15px] font-semibold sm:text-[15px] sm:font-semibold",
              task.done && "text-muted-foreground line-through",
            )}
          >
            {task.task}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] leading-snug tabular-nums text-muted-foreground sm:hidden">
            {[time.label, area && `${area.number}. ${area.name}`, categoryName, assigneeName]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>

        {/* Kolumn 4: område — alltid samma plats, tryck öppnar kartan */}
        <span className="hidden w-[170px] shrink-0 items-center md:flex">
          {area ? (
            onOpenArea ? (
              <button
                type="button"
                onClick={() => onOpenArea(area.id)}
                title={`Visa ${area.name} på kartan`}
                className="inline-flex w-full items-center gap-1.5 rounded-full px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: area.color }} />
                <span className="truncate">{area.name}</span>
                <MapPin className="ml-auto h-3 w-3 shrink-0 opacity-60" />
              </button>
            ) : (
              <span className="inline-flex w-full items-center gap-1.5 px-2 text-[12px] text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: area.color }} />
                <span className="truncate">{area.name}</span>
              </span>
            )
          ) : (
            <span className="px-2 text-[12px] text-muted-foreground/60">Inget område</span>
          )}
        </span>

        {/* Kolumn 5: kategori */}
        <span className="hidden w-[120px] shrink-0 truncate text-[11px] text-muted-foreground 2xl:block">
          {categoryName ?? (task.work_type ? workTypeLabel(task.work_type) : "")}
        </span>

        {/* Kolumn 6: krav och bilder */}
        <span className="hidden w-[96px] shrink-0 items-center justify-end gap-1.5 text-[10px] text-muted-foreground xl:flex">
          {duration && (
            <span className="inline-flex items-center gap-0.5">
              <Timer className="h-3 w-3" /> {duration}
            </span>
          )}
          {task.requires_photo && <Camera className={cn("h-3 w-3", photoMissing && "text-amber-600")} />}
          {(task.requires_note || task.requires_value) && (
            <span className={cn(blocked && "text-amber-600")} title={missingText(task, ["note"])}>
              Krav
            </span>
          )}
          {effectivePhotoCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <ImageIcon className="h-3 w-3" /> {effectivePhotoCount}
            </span>
          )}
        </span>

        {/* Kolumn 7: person — alltid samma plats */}
        <span className="hidden w-[150px] shrink-0 items-center gap-2 lg:flex">
          {(() => {
            const name = task.done ? completedByName || task.signature || assigneeName : assigneeName;
            const img = task.done ? completedByImage || assigneeImage : assigneeImage;
            if (!name) return <span className="text-[11px] text-muted-foreground">Ingen tilldelad</span>;
            return (
              <>
                <StaffAvatar name={name} imageUrl={img} className="h-9 w-9 shrink-0" />
                <span className={cn("truncate text-[11px]", task.done ? "text-emerald-600" : "text-muted-foreground")}>
                  {task.done ? "Klar · " : ""}
                  {name}
                </span>
              </>
            );
          })()}
        </span>

        {/* Kolumn 8: status — alltid samma bredd så raderna står i linje */}
        <span className="hidden w-[76px] shrink-0 justify-end sm:flex">
          {!task.done && running && (
            <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700">
              Pågår
            </span>
          )}
        </span>


        {/* Kolumn 9: rulldown */}
        <button
          type="button"
          aria-label={open ? "Stäng detaljer" : "Visa detaljer"}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-primary/20 px-3 pb-3 pt-2.5 text-sm">
          {/* En enda start — "Starta uppgiften" tar dig dit arbetet görs */}
          {!task.done && (
            <Button
              className="h-12 w-full justify-start gap-2 text-sm font-semibold"
              onClick={startNow}
              disabled={start.isPending}
            >
              {running ? <Timer className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? "Fortsätt uppgiften" : "Starta uppgiften"}
            </Button>
          )}


          {/* Allt om uppgiften: redigera, historik, vilka som gjort den, vilka dagar */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              variant="secondary"
              className="col-span-2 h-10 justify-start gap-2 text-sm font-semibold sm:col-span-1"
              onClick={() => openDetailAt("genomfor")}
            >
              <Info className="h-4 w-4" /> Mer om uppgiften
            </Button>
            <Button variant="outline" className="h-10 gap-1.5 text-xs" onClick={() => openDetailAt("historik")}>
              <Timer className="h-3.5 w-3.5" /> Historik &amp; tider
            </Button>
            <Button variant="outline" className="h-10 gap-1.5 text-xs" onClick={() => openDetailAt("instruktion")}>
              <Info className="h-3.5 w-3.5" /> Hur gör vi?
            </Button>
            <Button variant="outline" className="h-10 gap-1.5 text-xs" onClick={() => openDetailAt("inst")}>
              <Info className="h-3.5 w-3.5" /> Redigera &amp; dagar
            </Button>
          </div>

          {/* Utförandet — samma sida, stegen med "Klar · nästa steg" läggs över listan */}
          <TaskRunFullscreen
            open={showRun && guideSteps.length > 0}
            onClose={() => setShowRun(false)}
            checklistItemId={task.id}
            taskName={task.task}
            steps={guideSteps}
            photoCount={effectivePhotoCount}
            requiresPhoto={task.requires_photo}
            blockedText={blocked ? missingText(task, missing) : undefined}
            onAddPhoto={async (file) => onAddPhoto?.(file)}
            onFinish={async () => {
              /* Stoppa klockan så tiden sparas — annars står uppgiften kvar som pågående. */
              if (task.started_at) await finish.mutateAsync({ id: task.id, startedAt: task.started_at });
              else onToggle(true);
              setShowRun(false);
            }}
            prepMissingCount={prepMissingCount}
            prepNode={
              needs.length > 0 ? (
                <TaskPrepPanel checklistItemId={task.id} storeId={storeId} needs={needs} />
              ) : undefined
            }
          />



          {/* Klar men bilden saknas — tydlig påminnelse om att lägga in den i efterhand */}
          {task.done && task.requires_photo && effectivePhotoCount === 0 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[12px] font-medium text-amber-700">
              Bilden saknas på den här uppgiften — lägg in den i efterhand med "Ta bild".
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {time.kind !== "none" && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {time.label}
              </span>
            )}
            {linkLabel && onOpenLink && (
              <button
                type="button"
                onClick={onOpenLink}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20"
              >
                <ArrowUpRight className="h-3 w-3" /> {linkLabel}
              </button>
            )}
            {area && onOpenArea && (
              <button
                type="button"
                onClick={() => onOpenArea(area.id)}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover:bg-muted"
              >
                <MapPin className="h-3 w-3" /> Visa på kartan
              </button>
            )}
          </div>

          {(task.requires_note || task.requires_value) && onSaveRequirement && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              {task.requires_value && (
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{valueLabel(task)}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    className="h-8"
                    value={valueDraft}
                    onChange={(e) => setValueDraft(e.target.value)}
                    onBlur={() =>
                      onSaveRequirement({ completion_value: valueDraft === "" ? null : Number(valueDraft) })
                    }
                  />
                </div>
              )}
              {task.requires_note && (
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[12px] text-muted-foreground">Kommentar</span>
                  <Input
                    className="h-8"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={() => onSaveRequirement({ completion_note: noteDraft.trim() || null })}
                  />
                </div>
              )}
              {blocked && <p className="text-[11px] text-amber-700">{missingText(task, missing)}</p>}
            </div>
          )}

          {staffOptions && onAssign && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Tilldelad</span>
              <Select
                value={task.assigned_staff_id ?? "none"}
                onValueChange={(v) => onAssign(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Ingen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen tilldelad</SelectItem>
                  {staffOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <StaffAvatar name={p.name} imageUrl={p.imageUrl} className="h-9 w-9" />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={task.done ? "outline" : "default"}
              disabled={blocked}
              onClick={() => tryToggle(!task.done)}
            >
              {task.done ? "Återöppna" : "Markera som klar"}
            </Button>
            {onAddPhoto && (
              <label className="inline-flex">
                {/* Flera bilder på en gång: kamera eller flera markerade i biblioteket */}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.currentTarget.value = "";
                    for (const file of files) onAddPhoto(file);
                  }}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                  <Camera className="h-4 w-4" /> Ta bilder
                </span>
              </label>
            )}

            <Button size="sm" variant="ghost" onClick={() => openDetailAt("instruktion")}>
              <ImageIcon className="mr-1 h-4 w-4" /> Hur gör jag?
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Ta bort
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
