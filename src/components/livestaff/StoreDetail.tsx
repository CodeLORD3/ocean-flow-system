import { useState } from "react";
import { ArrowLeft, CalendarClock, LogIn, LogOut, PencilLine, Plus, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEVIATION_LABEL, formatMinutes, formatDayHours, minutesToTime, type PlannedShiftRow } from "@/lib/liveStaff";
import { staffName, type LiveStoreRow } from "@/hooks/useLiveStaff";
import { Axis, NowLine, OpeningHoursBackdrop, TimeAxisHeader, pct } from "./TimeAxis";
import { StaffSegments } from "./StaffSegments";
import { StatusChip } from "./StatusChip";
import { PlannedShiftDialog } from "./PlannedShiftDialog";
import { ShiftEditDialog } from "./ShiftEditDialog";
import { ShiftLogList } from "./ShiftLogList";
import { useShiftEdits } from "@/hooks/useStaffShifts";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import type { ActualShiftRow } from "@/lib/liveStaff";

const LABEL_W = "w-40 sm:w-52";

/** Butiksvy: KPI, personaltimeline (planerat mot faktiskt) och händelselogg. */
export function StoreDetail({
  row,
  staffById,
  axis,
  nowMinutes,
  live,
  day,
  stores,
  onBack,
}: {
  row: LiveStoreRow;
  staffById: Map<string, any>;
  axis: Axis;
  nowMinutes: number;
  live: boolean;
  day: string;
  stores: { id: string; name: string }[];
  onBack: () => void;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedShiftRow | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ActualShiftRow | null>(null);

  const { staff } = useStaffAuth();
  const canEditShifts = ((staff?.portal_access ?? []) as string[]).includes("admin");
  const edits = useShiftEdits(row.shifts.map((s) => s.id));

  // Personal med rättad stämpling märks direkt i tidslinjen, inte bara i loggen.
  const editedStaff = new Set(
    row.shifts.filter((sh) => ((edits.data ?? new Map()).get(sh.id) ?? []).length > 0).map((sh) => sh.staff_id),
  );

  const openShift = (shift: ActualShiftRow) => {
    setEditingShift(shift);
    setShiftOpen(true);
  };

  const openPlan = (shift: PlannedShiftRow | null) => {
    setEditing(shift);
    setPlanOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Alla ställen
          </Button>
          <h2 className="text-sm font-heading font-bold text-foreground">{row.name}</h2>
          <Badge variant="outline" className="text-[10px]">{row.city}</Badge>
          <Badge variant="secondary" className="text-[10px]">{formatDayHours(row.hours)}</Badge>
        </div>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openPlan(null)}>
          <Plus className="h-3.5 w-3.5" /> Planera pass
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Personal på plats</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{row.workingNow}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Planerad arbetstid</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{formatMinutes(row.plannedMinutes)}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Registrerad tid</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{formatMinutes(row.workedMinutes)}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Avvikelser</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{row.deviations.length}</p>
        </CardContent></Card>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {row.staffRows.length === 0 ? (
            <div className="p-6 text-center">
              <Users className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                Inga planerade pass och inga stämplingar för {day}.
              </p>
            </div>
          ) : (
            <TooltipProvider>
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <TimeAxisHeader axis={axis} labelWidth={LABEL_W} />
                  {row.staffRows.map((sr) => {
                    const name = staffName(staffById, sr.staffId);
                    const staffShifts = row.shifts
                      .filter((sh) => sh.staff_id === sr.staffId)
                      .sort((a, b) => a.clocked_in_at.localeCompare(b.clocked_in_at));
                    return (
                      <div key={sr.staffId} className="flex border-b border-border last:border-0">
                        <div className={`sticky left-0 z-10 shrink-0 border-r border-border bg-card px-2 py-1.5 ${LABEL_W}`}>
                          <div className="flex items-center gap-1">
                            <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{name}</p>
                            {canEditShifts && staffShifts.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                onClick={() => openShift(staffShifts[staffShifts.length - 1])}
                                aria-label={`Rätta stämpling för ${name}`}
                                title="Rätta stämpling"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <StatusChip status={sr.status} />
                            {editedStaff.has(sr.staffId) && (
                              <Badge variant="outline" className="gap-1 border-amber-500/40 px-1 text-[9px] text-amber-600">
                                <PencilLine className="h-2.5 w-2.5" /> Redigerad
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="relative flex-1 py-1.5">
                          <OpeningHoursBackdrop
                            axis={axis}
                            open={row.hours.open}
                            close={row.hours.close}
                            closed={row.hours.closed}
                          />
                          <NowLine axis={axis} nowMinutes={live ? nowMinutes : -1} />
                          <StaffSegments row={sr} axis={axis} name={name} imageUrl={staffById.get(sr.staffId)?.profile_image_url ?? null} />
                          {sr.planned.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => openPlan(p)}
                              className="absolute top-0 h-full opacity-0"
                              style={{
                                left: `${pct(axis, Number(p.start_time.slice(0, 2)) * 60 + Number(p.start_time.slice(3, 5)))}%`,
                                width: "1%",
                              }}
                              aria-label={`Ändra pass ${p.start_time}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Stämplingar {canEditShifts ? "— klicka på pennan för att rätta tid eller flytta pass" : ""}
          </p>
          <TooltipProvider>
            <ShiftLogList
              shifts={row.shifts}
              day={day}
              nowMinutes={nowMinutes}
              live={live}
              nameOf={(id) => staffName(staffById, id)}
              editsByShift={edits.data ?? new Map()}
              canEdit={canEditShifts}
              onEdit={openShift}
            />
          </TooltipProvider>
        </CardContent>
      </Card>

      <div className="grid gap-2 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Avvikelser</p>
            {row.deviations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga avvikelser för dagen.</p>
            ) : (
              <ul className="space-y-1">
                {row.deviations.map((d, i) => (
                  <li key={`${d.kind}-${i}`} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                      {DEVIATION_LABEL[d.kind]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {d.staffId ? `${staffName(staffById, d.staffId)} — ` : ""}
                      {d.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Händelselogg</p>
            {row.events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga stämplingshändelser för dagen.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {row.events.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">{minutesToTime(e.minutes)}</span>
                    {e.kind === "in" ? (
                      <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-foreground">{staffName(staffById, e.staffId)}</span>
                    <span className="text-muted-foreground">
                      {e.kind === "in" ? "stämplade in" : "stämplade ut"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <PlannedShiftDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        storeId={row.id}
        storeName={row.name}
        day={day}
        editing={editing}
      />
      <ShiftEditDialog
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        shift={editingShift}
        staffName={editingShift ? staffName(staffById, editingShift.staff_id) : ""}
        day={day}
        stores={stores}
      />
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <CalendarClock className="h-3 w-3" /> Rast härleds ur stämplingspar — ut och in igen samma dag.
      </p>
    </div>
  );
}
