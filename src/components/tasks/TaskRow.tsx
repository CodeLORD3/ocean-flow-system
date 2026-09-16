import { useState } from "react";
import { Camera, Check, ChevronDown, ChevronRight, Clock, ImageIcon, MapPin, Timer, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import { durationText, taskTime } from "@/lib/taskTime";
import { missingRequirements, missingText, valueLabel } from "@/lib/taskRequirements";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workTypeLabel } from "@/lib/workType";
import type { TaskRow as Task } from "@/hooks/useTasks";

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
  /** Sparar det som krävs för att få bocka av (kommentar/mätvärde). */
  onSaveRequirement?: (patch: { completion_note?: string | null; completion_value?: number | null }) => void;
  /** Sätts när antalet bilder är känt — då spärras även bildkravet. */
  photoCountKnown?: boolean;
  /** Personer som kan få uppgiften. Visas som snabb tilldelning i rulldownen. */
  staffOptions?: { id: string; name: string; imageUrl?: string | null }[];
  onAssign?: (staffId: string | null) => void;
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
  onSaveRequirement,
  photoCountKnown,
  staffOptions,
  onAssign,
}: Props) {
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.completion_note ?? "");
  const [valueDraft, setValueDraft] = useState(
    task.completion_value === null || task.completion_value === undefined ? "" : String(task.completion_value),
  );
  const time = taskTime(task);
  const duration = durationText(task.estimated_minutes);
  const accent = area?.color ?? categoryColor ?? "hsl(var(--muted-foreground))";
  const photoMissing = task.requires_photo && photoCount === 0;
  const missing = missingRequirements(task, { photoCount, checkPhoto: !!photoCountKnown });
  const blocked = !task.done && missing.length > 0;
  const tryToggle = (done: boolean) => {
    if (done && blocked) {
      setOpen(true);
      return;
    }
    onToggle(done);
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-colors",
        task.done && "border-emerald-500/40 bg-emerald-500/10",
        photoMissing && !task.done && "border-amber-500/40",
      )}
      style={{ borderLeft: `3px solid ${task.done ? "hsl(152 60% 42%)" : accent}` }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 min-h-[40px]">
        <button
          type="button"
          aria-label={task.done ? "Återöppna uppgift" : "Markera som klar"}
          onClick={() => tryToggle(!task.done)}
          title={blocked ? missingText(task, missing) : undefined}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
            task.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:bg-muted",
          )}
        >
          {task.done && <Check className="h-3.5 w-3.5" />}
        </button>

        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            {time.label && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">{time.label}</span>
            )}
            <span className={cn("truncate text-[13px] font-medium", task.done && "text-muted-foreground line-through")}>
              {task.task}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            {area && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                {area.number}. {area.name}
              </span>
            )}
            {categoryName && <span>{categoryName}</span>}
            {!categoryName && task.work_type && <span>{workTypeLabel(task.work_type)}</span>}
            {duration && (
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" /> {duration}
              </span>
            )}
            {assigneeName && (
              <span className="inline-flex items-center gap-1">
                <StaffAvatar name={assigneeName} imageUrl={assigneeImage} className="h-7 w-7" /> {assigneeName}
              </span>
            )}
            {(task.requires_note || task.requires_value) && (
              <span className={cn("inline-flex items-center gap-1", blocked && "text-amber-600")}>
                {task.requires_note && "Kommentar krävs"}
                {task.requires_note && task.requires_value && " · "}
                {task.requires_value && `${valueLabel(task)} krävs`}
              </span>
            )}
            {task.requires_photo && (
              <span className={cn("inline-flex items-center gap-1", photoMissing && "text-amber-600")}>
                <Camera className="h-3 w-3" /> Foto krävs
              </span>
            )}
            {photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> {photoCount}
              </span>
            )}
            {task.done && (completedByName || task.signature) && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <StaffAvatar
                  name={completedByName || task.signature}
                  imageUrl={completedByImage}
                  className="h-7 w-7"
                />
                Klar · {completedByName || task.signature}
              </span>
            )}
          </div>
        </button>

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
        <div className="space-y-3 border-t px-4 py-3 text-sm">
          {task.important_note && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">{task.important_note}</p>
          )}
          {task.instructions && task.instructions.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
              {task.instructions.slice(0, 4).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {task.note && <p className="text-[13px] text-muted-foreground">{task.note}</p>}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {time.kind !== "none" && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {time.label}
              </span>
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
                        <StaffAvatar name={p.name} imageUrl={p.imageUrl} className="h-7 w-7" />
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
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAddPhoto(file);
                    e.currentTarget.value = "";
                  }}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                  <Camera className="h-4 w-4" /> Ta bild
                </span>
              </label>
            )}
            <Button size="sm" variant="ghost" onClick={onOpenDetail}>
              Mer info →
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
