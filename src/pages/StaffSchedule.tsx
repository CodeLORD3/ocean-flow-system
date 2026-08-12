import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";
import { usePlannedShiftsRange } from "@/hooks/usePlannedShifts";
import { PlannedShiftDialog } from "@/components/livestaff/PlannedShiftDialog";
import { dateKey, formatMinutes, type PlannedShiftRow } from "@/lib/liveStaff";

const DAY_NAMES = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

/** Måndagen i veckan för ett datum. */
function mondayOf(day: string): Date {
  const d = new Date(`${day}T12:00:00`);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function shiftMinutes(p: PlannedShiftRow): number {
  return Math.max(0, minutesOf(p.end_time) - minutesOf(p.start_time));
}

export default function StaffSchedule() {
  const [anchor, setAnchor] = useState(() => dateKey());
  const [storeFilter, setStoreFilter] = useState("all");

  const { data: stores = [] } = useStores(true);
  const { data: staff = [], isLoading: staffLoading } = useStaff();

  const monday = useMemo(() => mondayOf(anchor), [anchor]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return dateKey(d);
      }),
    [monday],
  );

  const { data: planned = [], isLoading } = usePlannedShiftsRange(
    days[0],
    days[6],
    storeFilter === "all" ? null : storeFilter,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDay, setDialogDay] = useState(days[0]);
  const [dialogStore, setDialogStore] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlannedShiftRow | null>(null);

  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "Ingen enhet";

  const staffIdsWithShifts = new Set(planned.map((p) => p.staff_id));
  const staffRows = useMemo(() => {
    const list = staff.filter((s: any) =>
      storeFilter === "all" ? true : s.store_id === storeFilter || staffIdsWithShifts.has(s.id),
    );
    return list;
  }, [staff, storeFilter, planned]);

  const byStaffDay = useMemo(() => {
    const map = new Map<string, PlannedShiftRow[]>();
    planned.forEach((p) => {
      const key = `${p.staff_id}|${p.shift_date}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return map;
  }, [planned]);

  const weekMinutes = (staffId: string) =>
    planned.filter((p) => p.staff_id === staffId).reduce((sum, p) => sum + shiftMinutes(p), 0);

  const totalMinutes = planned.reduce((sum, p) => sum + shiftMinutes(p), 0);

  const openDialog = (staffId: string | null, day: string, shift: PlannedShiftRow | null) => {
    setDialogDay(day);
    setDialogStore(shift?.store_id ?? (storeFilter === "all" ? null : storeFilter));
    setEditing(shift);
    setDialogOpen(true);
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + delta * 7);
    setAnchor(dateKey(d));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-heading font-bold text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" /> Schema
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lägg in planerade pass i förväg — veckovy per enhet. Jämförs mot faktiska stämplingar i Live personal.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => openDialog(null, days[0], null)}>
          <Plus className="h-3.5 w-3.5" /> Planera pass
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-1)} aria-label="Föregående vecka">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value || dateKey())}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(1)} aria-label="Nästa vecka">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla enheter</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px]">
            {days[0]} – {days[6]}
          </Badge>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            Planerat totalt {formatMinutes(totalMinutes)}
          </Badge>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading || staffLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : staffRows.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                Ingen personal att schemalägga för den här enheten.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left font-medium text-muted-foreground">
                      Anställd
                    </th>
                    {days.map((d, i) => (
                      <th key={d} className="px-2 py-2 text-left font-medium text-muted-foreground">
                        {DAY_NAMES[i]} <span className="tabular-nums font-normal">{d.slice(5)}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Vecka</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((s: any) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 max-w-[180px] truncate border-r border-border bg-card px-2 py-1.5 font-medium text-foreground">
                        {s.first_name} {s.last_name}
                      </td>
                      {days.map((d) => {
                        const rows = byStaffDay.get(`${s.id}|${d}`) ?? [];
                        return (
                          <td key={d} className="align-top px-1 py-1">
                            <div className="flex flex-col gap-1">
                              {rows.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => openDialog(s.id, d, p)}
                                  className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-left tabular-nums text-[11px] text-foreground hover:bg-primary/20"
                                >
                                  {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
                                  <span className="block truncate text-[9px] text-muted-foreground">
                                    {storeName(p.store_id)}
                                  </span>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => openDialog(s.id, d, null)}
                                className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                aria-label={`Planera pass ${d}`}
                              >
                                +
                              </button>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatMinutes(weekMinutes(s.id))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PlannedShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        storeId={dialogStore ?? stores[0]?.id ?? ""}
        storeName={storeName(dialogStore ?? stores[0]?.id ?? null)}
        day={dialogDay}
        editing={editing}
      />
    </motion.div>
  );
}
