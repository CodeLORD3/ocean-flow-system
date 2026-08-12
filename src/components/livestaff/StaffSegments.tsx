import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Segment, formatMinutes, minutesToTime, StaffDayRow } from "@/lib/liveStaff";
import { Axis, pct } from "./TimeAxis";
import { cn } from "@/lib/utils";

interface Props {
  row: StaffDayRow;
  axis: Axis;
  name: string;
  compact?: boolean;
}

function tone(seg: Segment, row: StaffDayRow) {
  if (seg.kind === "planned") return "border border-dashed border-primary/60 bg-primary/10";
  if (seg.kind === "break") return "bg-amber-400/70";
  if (row.deviations.length && !seg.open) return "bg-destructive/70";
  return seg.open ? "bg-emerald-500" : "bg-emerald-500/50";
}

/** Segmenten för en anställd, planerat under och faktiskt ovanpå. */
export function StaffSegments({ row, axis, name, compact }: Props) {
  const segments: Segment[] = [...row.plannedSegments, ...row.actualSegments];
  const plannedText = row.plannedSegments.length
    ? row.plannedSegments.map((s) => `${minutesToTime(s.from)}–${minutesToTime(s.to)}`).join(", ")
    : "Inget planerat pass";

  return (
    <div className={cn("relative", compact ? "h-5" : "h-6")}>
      {segments.map((seg, i) => (
        <Tooltip key={`${seg.kind}-${i}`}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "absolute rounded-sm",
                tone(seg, row),
                seg.kind === "planned" ? "top-0 h-full" : compact ? "top-1 h-3" : "top-1.5 h-3",
              )}
              style={{
                left: `${pct(axis, seg.from)}%`,
                width: `${Math.max(0.6, pct(axis, seg.to) - pct(axis, seg.from))}%`,
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="font-semibold">{name}</p>
            <p className="text-muted-foreground">Planerat: {plannedText}</p>
            <p className="text-muted-foreground">
              {seg.kind === "break"
                ? `Rast ${minutesToTime(seg.from)}–${minutesToTime(seg.to)}`
                : seg.kind === "planned"
                  ? `Planerat ${minutesToTime(seg.from)}–${minutesToTime(seg.to)}`
                  : `Instämplad ${minutesToTime(seg.from)}${seg.open ? " (pågår)" : `–${minutesToTime(seg.to)}`}`}
            </p>
            <p className="text-muted-foreground">Arbetad tid: {formatMinutes(row.workedMinutes)}</p>
            {row.deviations.map((d) => (
              <p key={d.kind} className="text-destructive">
                {d.detail}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
