import { useState } from "react";
import { Camera, Check, ChevronDown, ChevronRight, Clock, ImageIcon, MapPin, Timer, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { durationText, taskTime } from "@/lib/taskTime";
import { workTypeLabel } from "@/lib/workType";
import type { TaskRow as Task } from "@/hooks/useTasks";

export type TaskRowArea = { id: string; name: string; color: string; number: number } | null;

type Props = {
  task: Task;
  area: TaskRowArea;
  categoryName?: string | null;
  categoryColor?: string | null;
  assigneeName?: string | null;
  completedByName?: string | null;
  photoCount?: number;
  onToggle: (done: boolean) => void;
  onOpenDetail: () => void;
  onAddPhoto?: (file: File) => void;
  onOpenArea?: (areaId: string) => void;
  onDelete?: () => void;
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
  completedByName,
  photoCount = 0,
  onToggle,
  onOpenDetail,
  onAddPhoto,
  onOpenArea,
}: Props) {
  const [open, setOpen] = useState(false);
  const time = taskTime(task);
  const duration = durationText(task.estimated_minutes);
  const accent = area?.color ?? categoryColor ?? "hsl(var(--muted-foreground))";
  const photoMissing = task.requires_photo && photoCount === 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-colors",
        task.done && "bg-muted/40",
        photoMissing && !task.done && "border-amber-500/40",
      )}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-3 px-3 py-3 min-h-[56px]">
        <button
          type="button"
          aria-label={task.done ? "Återöppna uppgift" : "Markera som klar"}
          onClick={() => onToggle(!task.done)}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            task.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:bg-muted",
          )}
        >
          {task.done && <Check className="h-5 w-5" />}
        </button>

        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            {time.label && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">{time.label}</span>
            )}
            <span className={cn("truncate text-sm font-medium", task.done && "text-muted-foreground line-through")}>
              {task.task}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {area && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: area.color }} />
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
                <User className="h-3 w-3" /> {assigneeName}
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
              <span className="text-emerald-600">Klar · {completedByName || task.signature}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          aria-label={open ? "Stäng detaljer" : "Visa detaljer"}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={task.done ? "outline" : "default"} onClick={() => onToggle(!task.done)}>
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
          </div>
        </div>
      )}
    </div>
  );
}
