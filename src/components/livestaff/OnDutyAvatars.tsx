import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LiveStatus, STATUS_LABEL, StaffDayRow, minutesToTime } from "@/lib/liveStaff";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  working: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/40",
  break: "bg-amber-500/15 text-amber-700 ring-amber-500/40",
  deviation: "bg-destructive/15 text-destructive ring-destructive/40",
};

/** Statusar som räknas som "på plats just nu". */
const NOW_STATUSES: LiveStatus[] = ["working", "break", "deviation"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

interface Person {
  staffId: string;
  name: string;
  imageUrl: string | null;
  status: LiveStatus;
  since: string | null;
}

/**
 * Kompakt stapel med personerna som är instämplade just nu i en butik.
 * Samma visuella språk som "Arbetar nu"-kortet på Översikt.
 */
export function OnDutyAvatars({
  staffRows,
  staffById,
  live,
  onSelect,
  max = 4,
}: {
  staffRows: StaffDayRow[];
  staffById: Map<string, any>;
  live: boolean;
  onSelect: () => void;
  max?: number;
}) {
  const people: Person[] = live
    ? staffRows
        .filter((r) => NOW_STATUSES.includes(r.status))
        .map((r) => {
          const s = staffById.get(r.staffId);
          const open = r.actualSegments.find((seg) => seg.open) ?? r.actualSegments[0];
          return {
            staffId: r.staffId,
            name: s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Okänd person" : "Okänd person",
            imageUrl: s?.profile_image_url ?? null,
            status: r.status,
            since: open ? minutesToTime(open.from) : null,
          };
        })
    : [];

  if (people.length === 0) {
    return (
      <p className="text-[10px] leading-tight text-muted-foreground/70">Ingen instämplad</p>
    );
  }

  const shown = people.slice(0, max);
  const rest = people.slice(max);

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Tooltip key={p.staffId}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              aria-label={`${p.name} — ${STATUS_LABEL[p.status]}`}
              className={cn(
                "relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 transition-transform hover:z-10 hover:scale-110",
                TONE[p.status] ?? TONE.working,
              )}
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[8px] font-semibold leading-none">{initials(p.name)}</span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="font-medium">{p.name}</p>
            <p className="text-muted-foreground">
              {STATUS_LABEL[p.status]}
              {p.since ? ` · in ${p.since}` : ""}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              aria-label={`Ytterligare ${rest.length} personer`}
              className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground ring-2 ring-border transition-transform hover:z-10 hover:scale-110"
            >
              +{rest.length}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {rest.map((p) => (
              <p key={p.staffId}>
                {p.name} — {STATUS_LABEL[p.status]}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
