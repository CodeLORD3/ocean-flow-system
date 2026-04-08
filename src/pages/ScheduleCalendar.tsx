import { useState, useMemo } from "react";
import { format, getDaysInMonth, startOfMonth, getDay, isToday, parseISO, isSameMonth } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSite } from "@/contexts/SiteContext";
import { useScheduleEvents, EVENT_TYPES, SEVERITY_LEVELS, RECURRENCE_OPTIONS, type ScheduleEvent } from "@/hooks/useScheduleEvents";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Repeat } from "lucide-react";

const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];
const WEEKDAYS_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

// Swedish holidays (fixed dates)
const SWEDISH_HOLIDAYS: Record<string, string> = {
  "01-01": "Nyårsdagen",
  "01-06": "Trettondedag jul",
  "05-01": "Första maj",
  "06-06": "Nationaldagen",
  "12-24": "Julafton",
  "12-25": "Juldagen",
  "12-26": "Annandag jul",
  "12-31": "Nyårsafton",
  "06-20": "Midsommarafton",
  "06-21": "Midsommardagen",
};

function getSeverityColor(severity: string) {
  return SEVERITY_LEVELS.find(s => s.value === severity)?.color || "bg-blue-500";
}

function getEventTypeInfo(type: string) {
  return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[0];
}

export default function ScheduleCalendar() {
  const { site, activeStoreId } = useSite();
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);

  const { events, isLoading, addEvent, deleteEvent } = useScheduleEvents(site, year, site === "shop" ? activeStoreId : null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("note");
  const [formSeverity, setFormSeverity] = useState("info");
  const [formDate, setFormDate] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("none");
  const [formRecurrenceEnd, setFormRecurrenceEnd] = useState("");

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    events.forEach(e => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    return map;
  }, [events]);

  const openAddDialog = (date?: string) => {
    setFormTitle("");
    setFormDesc("");
    setFormType("note");
    setFormSeverity("info");
    setFormDate(date || format(new Date(), "yyyy-MM-dd"));
    setFormRecurrence("none");
    setFormRecurrenceEnd("");
    setShowAddDialog(true);
  };

  const handleAdd = async () => {
    if (!formTitle.trim()) return;
    try {
      await addEvent.mutateAsync({
        event_date: formDate,
        title: formTitle,
        description: formDesc || undefined,
        event_type: formType,
        severity: formSeverity,
        portal: site,
        store_id: site === "shop" ? activeStoreId : null,
        recurrence_type: formRecurrence,
        recurrence_end_date: formRecurrenceEnd || null,
      });
      toast({ title: "Händelse tillagd" });
      setShowAddDialog(false);
    } catch {
      toast({ title: "Fel", description: "Kunde inte spara", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEvent.mutateAsync(id);
      toast({ title: "Händelse borttagen" });
      setShowDayDetail(false);
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const openDayDetail = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowDayDetail(true);
  };

  // ── YEAR VIEW ──
  const renderYearView = () => (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
      {MONTHS.map((monthName, monthIdx) => {
        const daysInMonth = getDaysInMonth(new Date(year, monthIdx));
        const firstDay = (getDay(startOfMonth(new Date(year, monthIdx))) + 6) % 7; // Monday=0
        return (
          <div
            key={monthIdx}
            className="border border-border bg-card p-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedMonth(monthIdx)}
          >
            <div className="text-[10px] font-bold text-foreground mb-1 tracking-wide">{monthName.toUpperCase()}</div>
            <div className="grid grid-cols-7 gap-px">
              {/* Weekday headers */}
              {WEEKDAYS_SHORT.map(d => (
                <div key={d} className="text-[7px] text-muted-foreground text-center">{d[0]}</div>
              ))}
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="h-3" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                const day = dayIdx + 1;
                const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] || [];
                const holidayKey = `${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isHoliday = SWEDISH_HOLIDAYS[holidayKey];
                const isWeekend = ((firstDay + dayIdx) % 7) >= 5;
                const today = isToday(new Date(year, monthIdx, day));

                // Determine dot color based on highest severity
                let dotColor = "";
                if (dayEvents.length > 0) {
                  const severities = ["critical", "high", "medium", "low", "info"];
                  const highest = severities.find(s => dayEvents.some(e => e.severity === s));
                  dotColor = getSeverityColor(highest || "info");
                } else if (isHoliday) {
                  dotColor = "bg-rose-400";
                }

                return (
                  <div
                    key={day}
                    className={cn(
                      "h-3 flex items-center justify-center relative text-[7px] leading-none",
                      today && "ring-1 ring-primary",
                      isWeekend && !isHoliday && !dotColor && "text-muted-foreground/50",
                    )}
                    title={isHoliday || dayEvents.map(e => e.title).join(", ") || undefined}
                  >
                    {dotColor ? (
                      <div className={cn("h-2 w-2 rounded-full", dotColor)} />
                    ) : (
                      <span className={cn(isWeekend && "opacity-40")}>{day}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── MONTH VIEW ──
  const renderMonthView = (monthIdx: number) => {
    const daysInMonth = getDaysInMonth(new Date(year, monthIdx));
    const firstDay = (getDay(startOfMonth(new Date(year, monthIdx))) + 6) % 7;

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => setExpandedMonth(null)} className="text-[10px] h-7 px-2">
            <ChevronLeft className="h-3 w-3 mr-1" /> Årsvy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpandedMonth(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0} className="h-7 w-7 p-0">
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <h2 className="text-sm font-bold tracking-wide">{MONTHS[monthIdx].toUpperCase()} {year}</h2>
          <Button variant="ghost" size="sm" onClick={() => setExpandedMonth(Math.min(11, monthIdx + 1))} disabled={monthIdx === 11} className="h-7 w-7 p-0">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => openAddDialog(`${year}-${String(monthIdx + 1).padStart(2, "0")}-01`)} className="text-[10px] h-7 gap-1">
            <Plus className="h-3 w-3" /> Lägg till
          </Button>
        </div>

        <div className="grid grid-cols-7 border border-border">
          {/* Weekday headers */}
          {WEEKDAYS_SHORT.map(d => (
            <div key={d} className="text-[9px] font-bold text-muted-foreground text-center py-1 bg-muted/50 border-b border-border">{d}</div>
          ))}
          {/* Empty cells */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} className="min-h-[80px] border-b border-r border-border bg-muted/20" />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
            const day = dayIdx + 1;
            const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = eventsByDate[dateStr] || [];
            const holidayKey = `${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const holiday = SWEDISH_HOLIDAYS[holidayKey];
            const isWeekend = ((firstDay + dayIdx) % 7) >= 5;
            const today = isToday(new Date(year, monthIdx, day));

            return (
              <div
                key={day}
                className={cn(
                  "min-h-[80px] border-b border-r border-border p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                  isWeekend && "bg-muted/10",
                  today && "ring-1 ring-inset ring-primary",
                )}
                onClick={() => openDayDetail(dateStr)}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-[10px] font-medium", today && "text-primary font-bold", isWeekend && "text-muted-foreground")}>{day}</span>
                  {dayEvents.length > 0 && (
                    <span className="text-[8px] text-muted-foreground">{dayEvents.length}</span>
                  )}
                </div>
                {holiday && (
                  <div className="text-[8px] text-rose-400 truncate mt-0.5">{holiday}</div>
                )}
                {dayEvents.slice(0, 3).map(evt => (
                  <div
                    key={evt.id}
                    className={cn("text-[8px] truncate mt-0.5 px-1 rounded-sm text-white", getEventTypeInfo(evt.event_type).color)}
                  >
                    {evt.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[7px] text-muted-foreground mt-0.5">+{dayEvents.length - 3} till</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── LEGEND ──
  const renderLegend = () => (
    <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground">
      <span className="font-bold text-foreground text-[10px]">LEGEND:</span>
      {SEVERITY_LEVELS.map(s => (
        <span key={s.value} className="flex items-center gap-1">
          <div className={cn("h-2 w-2 rounded-full", s.color)} /> {s.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-rose-400" /> Helgdag
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setYear(y => y - 1)} className="h-7 w-7 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold tracking-wide">{year}</h1>
          <Button variant="ghost" size="sm" onClick={() => setYear(y => y + 1)} className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setYear(new Date().getFullYear()); setExpandedMonth(null); }} className="text-[10px] h-7 px-2">
            Idag
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {renderLegend()}
          {expandedMonth === null && (
            <Button size="sm" onClick={() => openAddDialog()} className="text-[10px] h-7 gap-1">
              <Plus className="h-3 w-3" /> Ny händelse
            </Button>
          )}
        </div>
      </div>

      {/* Event type filter chips */}
      <div className="flex flex-wrap gap-1">
        {EVENT_TYPES.map(t => (
          <Badge key={t.value} variant="outline" className="text-[8px] gap-1 px-1.5 py-0.5 cursor-default">
            <div className={cn("h-1.5 w-1.5 rounded-full", t.color)} />
            {t.label}
          </Badge>
        ))}
      </div>

      {/* Main content */}
      {expandedMonth === null ? renderYearView() : renderMonthView(expandedMonth)}

      {/* ── ADD EVENT DIALOG ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Ny händelse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              className="text-xs h-8"
            />
            <Input
              placeholder="Titel"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              className="text-xs h-8"
            />
            <Textarea
              placeholder="Beskrivning (valfritt)"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              className="text-xs min-h-[60px]"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-muted-foreground font-medium">TYP</label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <div className={cn("h-2 w-2 rounded-full", t.color)} />
                          {t.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground font-medium">PRIORITET</label>
                <Select value={formSeverity} onValueChange={setFormSeverity}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <div className={cn("h-2 w-2 rounded-full", s.color)} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Recurrence */}
            <div>
              <label className="text-[9px] text-muted-foreground font-medium">UPPREPNING</label>
              <Select value={formRecurrence} onValueChange={setFormRecurrence}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(r => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        {r.value !== "none" && <Repeat className="h-3 w-3 text-muted-foreground" />}
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formRecurrence !== "none" && (
              <div>
                <label className="text-[9px] text-muted-foreground font-medium">UPPREPNING SLUTAR (VALFRITT)</label>
                <Input
                  type="date"
                  value={formRecurrenceEnd}
                  onChange={e => setFormRecurrenceEnd(e.target.value)}
                  className="text-xs h-8"
                  placeholder="Inget slutdatum"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)} className="text-[10px] h-7">Avbryt</Button>
            <Button size="sm" onClick={handleAdd} disabled={!formTitle.trim() || addEvent.isPending} className="text-[10px] h-7">
              {addEvent.isPending ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DAY DETAIL DIALOG ── */}
      <Dialog open={showDayDetail} onOpenChange={setShowDayDetail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {selectedDate && format(parseISO(selectedDate), "EEEE d MMMM yyyy", { locale: sv })}
              {selectedDate && SWEDISH_HOLIDAYS[selectedDate.slice(5)] && (
                <Badge variant="outline" className="text-[8px] text-rose-400 border-rose-400/30">{SWEDISH_HOLIDAYS[selectedDate.slice(5)]}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {selectedDate && (eventsByDate[selectedDate] || []).length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">Inga händelser denna dag</p>
            )}
            {selectedDate && (eventsByDate[selectedDate] || []).map(evt => (
              <div key={evt.id} className="border border-border p-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("h-2 w-2 rounded-full shrink-0", getEventTypeInfo(evt.event_type).color)} />
                    <span className="text-xs font-medium">{evt.title}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[7px] px-1 py-0">
                      {getEventTypeInfo(evt.event_type).label}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[7px] px-1 py-0")}>
                      {SEVERITY_LEVELS.find(s => s.value === evt.severity)?.label}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(evt.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {evt.description && <p className="text-[10px] text-muted-foreground">{evt.description}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => { setShowDayDetail(false); openAddDialog(selectedDate || undefined); }} className="text-[10px] h-7 gap-1">
              <Plus className="h-3 w-3" /> Lägg till händelse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
