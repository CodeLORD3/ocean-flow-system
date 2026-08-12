import { Pencil, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SHIFT_FIELD_LABEL, shiftTimeValue, type ShiftEdit } from "@/hooks/useStaffShifts";
import { formatMinutes, isoToMinutes, type ActualShiftRow } from "@/lib/liveStaff";

/** Lista över dagens stämplingar med möjlighet för admin att rätta dem. */
export function ShiftLogList({
  shifts,
  day,
  nowMinutes,
  live,
  nameOf,
  editsByShift,
  canEdit,
  onEdit,
}: {
  shifts: ActualShiftRow[];
  day: string;
  nowMinutes: number;
  live: boolean;
  nameOf: (staffId: string) => string;
  editsByShift: Map<string, ShiftEdit[]>;
  canEdit: boolean;
  onEdit: (shift: ActualShiftRow) => void;
}) {
  if (shifts.length === 0) {
    return <p className="text-xs text-muted-foreground">Inga stämplingar för dagen.</p>;
  }

  const sorted = [...shifts].sort((a, b) => a.clocked_in_at.localeCompare(b.clocked_in_at));

  return (
    <ul className="space-y-1">
      {sorted.map((s) => {
        const from = isoToMinutes(s.clocked_in_at, day);
        const to = s.clocked_out_at ? isoToMinutes(s.clocked_out_at, day) : live ? nowMinutes : 24 * 60;
        const edits = editsByShift.get(s.id) ?? [];
        return (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
              {shiftTimeValue(s.clocked_in_at)}–{s.clocked_out_at ? shiftTimeValue(s.clocked_out_at) : "pågår"}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{nameOf(s.staff_id)}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatMinutes(Math.max(0, to - from))}</span>
            {edits.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-[10px] text-primary">
                    <PencilLine className="h-3 w-3" /> Redigerad
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {edits.map((e) => (
                    <p key={e.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {SHIFT_FIELD_LABEL[e.field] ?? e.field}
                      </span>{" "}
                      ändrad av {e.edited_by_name ?? "okänd"}{" "}
                      {new Date(e.created_at).toLocaleString("sv-SE")} — tidigare:{" "}
                      {e.field === "store_id" ? e.old_value ?? "—" : e.old_value ? shiftTimeValue(e.old_value) : "tomt"}
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onEdit(s)}
                aria-label="Rätta stämpling"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
