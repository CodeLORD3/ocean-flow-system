import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Store as StoreIcon,
  Target,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLiveStaffDay, staffName } from "@/hooks/useLiveStaff";
import { dateKey, formatDayHours, isToday } from "@/lib/liveStaff";
import { buildAxis, NowLine, TimeAxisHeader } from "@/components/livestaff/TimeAxis";
import { StaffSegments } from "@/components/livestaff/StaffSegments";
import { StatusLegend } from "@/components/livestaff/StatusChip";
import { StoreDetail } from "@/components/livestaff/StoreDetail";
import { OnDutyAvatars } from "@/components/livestaff/OnDutyAvatars";

const LABEL_W = "w-40 sm:w-52";

type StatusFilter = "all" | "open" | "closed" | "deviation";

export default function LiveStaff() {
  const [day, setDay] = useState(() => dateKey());
  const [storeFilter, setStoreFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { rows, staffById, isLoading, now, nowMinutes, live } = useLiveStaffDay(day);

  const cities = useMemo(() => Array.from(new Set(rows.map((r) => r.city))).sort(), [rows]);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (storeFilter !== "all" && r.id !== storeFilter) return false;
        if (cityFilter !== "all" && r.city !== cityFilter) return false;
        if (statusFilter === "open" && !r.openNow) return false;
        if (statusFilter === "closed" && r.openNow) return false;
        if (statusFilter === "deviation" && r.deviations.length === 0) return false;
        return true;
      }),
    [rows, storeFilter, cityFilter, statusFilter],
  );

  const axis = useMemo(() => buildAxis(visible.map((r) => r.hours)), [visible]);

  const kpi = useMemo(() => {
    const workingNow = visible.reduce((s, r) => s + r.workingNow, 0);
    const openNow = visible.filter((r) => r.openNow).length;
    const plannedToday = visible.reduce((s, r) => s + r.plannedCount, 0);
    const deviations = visible.reduce((s, r) => s + r.deviations.length, 0);
    const staffRows = visible.flatMap((r) => r.staffRows).filter((r) => r.plannedMinutes > 0);
    const compliance = staffRows.length
      ? Math.round((staffRows.filter((r) => r.deviations.length === 0).length / staffRows.length) * 100)
      : null;
    return { workingNow, openNow, total: visible.length, plannedToday, deviations, compliance };
  }, [visible]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(dateKey(d));
  };

  const selectedRow = selected ? rows.find((r) => r.id === selected) ?? null : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-heading font-bold text-foreground">
            <Activity className="h-5 w-5 text-primary" /> Live personal
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bemanning, planerat schema och avvikelser på samtliga enheter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {live ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              LIVE — Senast uppdaterad {now.toLocaleTimeString("sv-SE")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <CalendarDays className="h-3 w-3" /> Historik {day}
            </Badge>
          )}
        </div>
      </div>

      {/* Filter */}
      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDay(-1)} aria-label="Föregående dag">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Input type="date" className="h-8 w-36 text-xs" value={day} onChange={(e) => setDay(e.target.value || dateKey())} />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftDay(1)} aria-label="Nästa dag">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!isToday(day) && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDay(dateKey())}>
                Idag
              </Button>
            )}
          </div>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla enheter</SelectItem>
              {rows.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla städer</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla statusar</SelectItem>
              <SelectItem value="open" className="text-xs">Öppna nu</SelectItem>
              <SelectItem value="closed" className="text-xs">Stängda nu</SelectItem>
              <SelectItem value="deviation" className="text-xs">Med avvikelse</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" /> I arbete nu</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{kpi.workingNow}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><DoorOpen className="h-3 w-3" /> Öppna nu</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{kpi.openNow}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><StoreIcon className="h-3 w-3" /> Enheter</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{kpi.total}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" /> Planerade idag</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{kpi.plannedToday}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><AlertTriangle className="h-3 w-3" /> Avvikelser</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">{kpi.deviations}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Target className="h-3 w-3" /> Schemaföljsamhet</p>
          <p className="text-xl font-heading font-bold tabular-nums text-foreground">
            {kpi.compliance === null ? "—" : `${kpi.compliance} %`}
          </p>
        </CardContent></Card>
      </div>

      <StatusLegend />

      {selectedRow ? (
        <StoreDetail
          row={selectedRow}
          staffById={staffById}
          axis={buildAxis([selectedRow.hours])}
          nowMinutes={nowMinutes}
          live={live}
          day={day}
          onBack={() => setSelected(null)}
        />
      ) : isLoading ? (
        <Card className="shadow-card"><CardContent className="space-y-2 p-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent></Card>
      ) : visible.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-8 text-center">
          <StoreIcon className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">Inga enheter matchar filtret.</p>
        </CardContent></Card>
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <TooltipProvider>
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <TimeAxisHeader axis={axis} labelWidth={LABEL_W} />
                  {visible.map((r) => (
                    <div key={r.id} className="flex border-b border-border last:border-0 hover:bg-muted/30">
                      <div
                        className={`sticky left-0 z-10 shrink-0 space-y-1 border-r border-border bg-card px-2 py-1.5 text-left ${LABEL_W}`}
                      >
                        <OnDutyAvatars
                          staffRows={r.staffRows}
                          staffById={staffById}
                          live={live}
                          onSelect={() => setSelected(r.id)}
                        />
                        <button type="button" onClick={() => setSelected(r.id)} className="block w-full text-left">
                          <p className="truncate text-xs font-medium text-foreground">{r.name}</p>
                          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${r.openNow ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                            />
                            {formatDayHours(r.hours)}
                            {r.deviations.length > 0 && (
                              <span className="text-destructive">· {r.deviations.length} avvikelse(r)</span>
                            )}
                          </p>
                        </button>
                      </div>
                      <div className="relative min-h-[2.5rem] flex-1 py-1">
                        <NowLine axis={axis} nowMinutes={live ? nowMinutes : -1} />
                        {r.staffRows.length === 0 ? (
                          <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            {r.hours.source === "none"
                              ? "Öppettid saknas — ange veckoschema på Butiker"
                              : "Inga planerade pass och inga stämplingar"}
                          </p>
                        ) : (
                          r.staffRows.map((sr) => (
                            <StaffSegments
                              key={sr.staffId}
                              row={sr}
                              axis={axis}
                              name={staffName(staffById, sr.staffId)}
                              imageUrl={staffById.get(sr.staffId)?.profile_image_url ?? null}
                              compact
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
