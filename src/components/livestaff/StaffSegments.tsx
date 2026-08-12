import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Segment,
  formatMinutes,
  formatMinutesShort,
  hasOngoing,
  minutesToTime,
  StaffDayRow,
} from "@/lib/liveStaff";
import { Axis, pct } from "./TimeAxis";
import { cn } from "@/lib/utils";

interface Props {
  row: StaffDayRow;
  axis: Axis;
  name: string;
  compact?: boolean;
  /** Profilbild för personen — visas som markör i början av bjälken. */
  imageUrl?: string | null;
  /** Överlagrat läge: alla personer i samma rad, en "fil" per person. */
  overlay?: boolean;
  lane?: number;
  lanes?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function tone(seg: Segment, row: StaffDayRow) {
  if (seg.kind === "planned") return "border border-dashed border-primary/60 bg-primary/10";
  if (seg.kind === "break") return "bg-amber-400/70";
  if (row.deviations.length && !seg.open) return "bg-destructive/70";
  return seg.open ? "bg-emerald-500" : "bg-emerald-500/50";
}

/** Segmenten för en anställd, planerat under och faktiskt ovanpå. */
export function StaffSegments({ row, axis, name, compact, imageUrl, overlay, lane = 0, lanes = 1 }: Props) {
  const segments: Segment[] = [...row.plannedSegments, ...row.actualSegments];
  const plannedText = row.plannedSegments.length
    ? row.plannedSegments.map((s) => `${minutesToTime(s.from)}–${minutesToTime(s.to)}`).join(", ")
    : "Inget planerat pass";

  const marker = segments.length ? Math.min(...segments.map((s) => s.from)) : null;
  const ongoing = hasOngoing(row);
  const markerTone =
    row.deviations.length
      ? "bg-destructive/15 text-destructive ring-destructive/40"
      : row.status === "break"
        ? "bg-amber-500/15 text-amber-700 ring-amber-500/40"
        : "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40";

  const lastEnd = segments.length ? Math.max(...segments.map((s) => s.to)) : null;

  // Överlagrat läge: varje person får sin egen "fil" inom samma radhöjd.
  const laneTop = ((lane + 0.5) / Math.max(1, lanes)) * 100;
  const barHeight = lanes <= 2 ? 12 : Math.max(4, Math.round(26 / lanes));
  const showLabel = !overlay || lanes <= 4;

  const laneStyle = (seg: Segment) =>
    overlay
      ? {
          top: `${laneTop}%`,
          transform: "translateY(-50%)",
          height: seg.kind === "planned" ? `${barHeight + 6}px` : `${barHeight}px`,
        }
      : undefined;

  return (
    <div className={cn(overlay ? "absolute inset-0" : "relative", !overlay && (compact ? "h-8" : "h-9"))}>
      {marker !== null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "absolute z-20 flex shrink-0 -translate-x-full items-center justify-center overflow-hidden rounded-full ring-2",
                overlay ? "-ml-1 h-5 w-5" : compact ? "-ml-1 top-1 h-6 w-6" : "-ml-1.5 top-1 h-7 w-7",
                markerTone,
              )}
              style={
                overlay
                  ? { left: `${pct(axis, marker)}%`, top: `${laneTop}%`, transform: "translate(-100%, -50%)" }
                  : { left: `${pct(axis, marker)}%` }
              }
            >
              {imageUrl ? (
                <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className={cn("font-semibold leading-none", overlay || compact ? "text-[9px]" : "text-[10px]")}>
                  {initials(name)}
                </span>
              )}
            </span>
          </TooltipTrigger>

          <TooltipContent side="top" className="text-xs">
            <p className="font-semibold">{name}</p>
            <p className="text-muted-foreground">Planerat: {plannedText}</p>
            <p className="text-muted-foreground">
              {ongoing ? "Arbetad tid (pågår): " : "Arbetad tid: "}
              {formatMinutes(row.workedMinutes)}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      {segments.map((seg, i) => (
        <Tooltip key={`${seg.kind}-${i}`}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "absolute rounded-sm",
                tone(seg, row),
                !overlay && (seg.kind === "planned" ? "top-0 h-full" : compact ? "top-2 h-4" : "top-2.5 h-4"),
              )}
              style={{
                left: `${pct(axis, seg.from)}%`,
                width: `${Math.max(0.6, pct(axis, seg.to) - pct(axis, seg.from))}%`,
                ...laneStyle(seg),
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
            <p className="text-muted-foreground">
              {ongoing ? "Arbetad tid (pågår): " : "Arbetad tid: "}
              {formatMinutes(row.workedMinutes)}
            </p>
            {row.deviations.map((d) => (
              <p key={d.kind} className="text-destructive">
                {d.detail}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      ))}
      {lastEnd !== null && showLabel && (
        <span
          className={cn(
            "pointer-events-none absolute z-20 flex items-center gap-1 whitespace-nowrap font-medium text-foreground",
            overlay ? "ml-1.5 text-[10px]" : compact ? "ml-1.5 top-1.5 text-[11px]" : "ml-2 top-1.5 text-xs",
          )}
          style={
            overlay
              ? { left: `${pct(axis, lastEnd)}%`, top: `${laneTop}%`, transform: "translateY(-50%)" }
              : { left: `${pct(axis, lastEnd)}%` }
          }
        >
          {name}
          <span
            className={cn(
              "rounded px-1 tabular-nums",
              ongoing ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            {formatMinutesShort(row.workedMinutes)}
          </span>
        </span>
      )}
    </div>
  );
}
