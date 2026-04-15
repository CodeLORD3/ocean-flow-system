import { useState, useMemo } from "react";
import { EditableText } from "@/components/EditableText";
import { format, getDaysInMonth, startOfMonth, getDay, isToday, parseISO, isBefore } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Copy, Check, UserCheck, Repeat, Calendar as CalendarIcon, Users, FileText, CalendarPlus, ListTodo, Pencil } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { useSite } from "@/contexts/SiteContext";
import { useScheduleEvents, EVENT_TYPES, SEVERITY_LEVELS, RECURRENCE_OPTIONS, type ScheduleEvent } from "@/hooks/useScheduleEvents";
import {
  useMeetingProtocols,
  useCreateMeetingProtocol,
  useUpdateMeetingProtocol,
  useAddProtocolItem,
  useUpdateProtocolItem,
  useDeleteProtocolItem,
} from "@/hooks/useMeetingProtocols";
import { useStaff } from "@/hooks/useStaff";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];
const WEEKDAYS_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

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

// Two main categories for the legend filter
const CATEGORY_FILTERS = [
  { value: "task", label: "Uppgifter", color: "bg-purple-500" },
  { value: "event", label: "Händelser", color: "bg-blue-500" },
] as const;

function getEventTypeInfo(type: string) {
  return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[0];
}

function isTaskType(type: string) {
  return type === "task";
}

function getEventDisplayColor(evt: ScheduleEvent): string {
  if (isTaskType(evt.event_type)) {
    if (evt.is_done) return "bg-emerald-500/60";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isBefore(parseISO(evt.event_date), today)) return "bg-red-400/60";
    return "bg-purple-500";
  }
  return getEventTypeInfo(evt.event_type).color;
}

function getSeverityDotColor(severity: string) {
  return SEVERITY_LEVELS.find(s => s.value === severity)?.color || "bg-blue-500";
}

function isDatePast(year: number, month: number, day?: number): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (day !== undefined) {
    return isBefore(new Date(year, month, day), now);
  }
  // For month: past if the entire month is before current month
  const lastDayOfMonth = new Date(year, month + 1, 0);
  return isBefore(lastDayOfMonth, now);
}

export default function ScheduleCalendar() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { events, isLoading, addEvent, updateEvent, deleteEvent } = useScheduleEvents(site, year, site === "shop" ? activeStoreId : null);
  const createProtocol = useCreateMeetingProtocol();
  const updateProtocol = useUpdateMeetingProtocol();
  const addProtocolItem = useAddProtocolItem();
  const updateProtocolItem = useUpdateProtocolItem();
  const deleteProtocolItem = useDeleteProtocolItem();
  const { data: protocols } = useMeetingProtocols(site === "shop" ? activeStoreId : null);
  const { data: staffMembers } = useStaff(site === "shop" ? (activeStoreId || undefined) : undefined);
  const queryClient = useQueryClient();
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [draggedProtocolItem, setDraggedProtocolItem] = useState<{ id: string; content: string; assigned_to: string | null; deadline: string | null; protocolTitle: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Dialog for creating event from dropped protocol item
  const [dropCreateDialog, setDropCreateDialog] = useState<{ targetDate: string; content: string; assignedTo: string | null; protocolTitle: string; itemId: string } | null>(null);
  const [dropFormType, setDropFormType] = useState<string>("task");
  const [dropFormTitle, setDropFormTitle] = useState("");
  const [dropFormDesc, setDropFormDesc] = useState("");

  // Category filter: "all" | "task" | "event"
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Editing state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", category: "event" as "event" | "task", type: "", severity: "", assignee: "", recurrence: "", recurrenceEnd: "" });

  // Form state for new event
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState<"event" | "task">("event");
  const [formType, setFormType] = useState("note");
  const [formSeverity, setFormSeverity] = useState("info");
  const [formDate, setFormDate] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("none");
  const [formRecurrenceEnd, setFormRecurrenceEnd] = useState("");
  const [formAssignee, setFormAssignee] = useState("");

  // Derived: actual event_type based on category
  const effectiveFormType = formCategory === "task" ? "task" : formType;

  // Meeting protocol new item text
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    events.filter(e => {
      if (categoryFilter === "task") return isTaskType(e.event_type);
      if (categoryFilter === "event") return !isTaskType(e.event_type);
      return true;
    }).forEach(e => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    return map;
  }, [events, categoryFilter]);

  // Meetings indexed by date
  const meetingDates = useMemo(() => {
    if (!protocols) return new Set<string>();
    return new Set(protocols.map(p => p.meeting_date));
  }, [protocols]);

  const meetingsForDate = useMemo(() => {
    if (!selectedDate || !protocols) return [];
    return protocols.filter(p => p.meeting_date === selectedDate);
  }, [selectedDate, protocols]);

  const openAddPanel = (date?: string) => {
    setFormTitle("");
    setFormDesc("");
    setFormCategory("event");
    setFormType("note");
    setFormSeverity("info");
    setFormDate(date || format(new Date(), "yyyy-MM-dd"));
    setFormRecurrence("none");
    setFormRecurrenceEnd("");
    setFormAssignee("none");
    setShowAddPanel(true);
  };

  const copyEvent = (evt: ScheduleEvent, date?: string) => {
    setFormTitle(evt.title);
    setFormDesc(evt.description || "");
    setFormCategory(isTaskType(evt.event_type) ? "task" : "event");
    setFormType(isTaskType(evt.event_type) ? "note" : evt.event_type);
    setFormSeverity(evt.severity);
    setFormDate(date || format(new Date(), "yyyy-MM-dd"));
    setFormRecurrence(evt.recurrence_type || "none");
    setFormRecurrenceEnd(evt.recurrence_end_date || "");
    setFormAssignee(evt.assigned_to || "none");
    setShowAddPanel(true);
  };

  const handleAdd = async () => {
    if (!formTitle.trim()) return;
    try {
      await addEvent.mutateAsync({
        event_date: formDate,
        title: formTitle,
        description: formDesc || undefined,
        event_type: effectiveFormType,
        severity: formSeverity,
        portal: site,
        store_id: site === "shop" ? activeStoreId : null,
        recurrence_type: formRecurrence,
        recurrence_end_date: formRecurrenceEnd || null,
        assigned_to: formCategory === "task" && formAssignee !== "none" ? formAssignee : null,
      });
      if (effectiveFormType === "meeting" && site === "shop" && activeStoreId) {
        await createProtocol.mutateAsync({
          store_id: activeStoreId,
          title: formTitle,
          meeting_date: formDate,
          notes: formDesc || undefined,
        });
      }
      toast({ title: effectiveFormType === "meeting" && site === "shop" ? "Möte tillagt i kalender & mötesprotokoll" : formCategory === "task" ? "Uppgift tillagd" : "Händelse tillagd" });
      setShowAddPanel(false);
    } catch {
      toast({ title: "Fel", description: "Kunde inte spara", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, meetingItemId?: string | null) => {
    try {
      await deleteEvent.mutateAsync(id);
      // Clear linked meeting protocol item
      if (meetingItemId) {
        await updateProtocolItem.mutateAsync({ id: meetingItemId, calendar_event_id: null, deadline: null });
      }
      toast({ title: "Händelse borttagen" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleToggleDone = async (evt: ScheduleEvent) => {
    const realId = evt.id.includes("__rec_") ? evt.id.split("__rec_")[0] : evt.id;
    const newDone = !evt.is_done;
    try {
      await updateEvent.mutateAsync({ id: realId, is_done: newDone } as any);
      if (evt.meeting_item_id) {
        await updateProtocolItem.mutateAsync({ id: evt.meeting_item_id, completed: newDone });
      }
      toast({ title: newDone ? "Markerad som klar" : "Återöppnad" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const startEditing = (evt: ScheduleEvent) => {
    setEditingEventId(evt.id);
    const isTask = isTaskType(evt.event_type);
    setEditForm({
      title: evt.title,
      description: evt.description || "",
      category: isTask ? "task" : "event",
      type: isTask ? "note" : evt.event_type,
      severity: evt.severity,
      assignee: evt.assigned_to || "none",
      recurrence: evt.recurrence_type || "none",
      recurrenceEnd: evt.recurrence_end_date || "",
    });
  };

  const saveEdit = async (evt: ScheduleEvent) => {
    const realId = evt.id.includes("__rec_") ? evt.id.split("__rec_")[0] : evt.id;
    const effectiveType = editForm.category === "task" ? "task" : editForm.type;
    try {
      await updateEvent.mutateAsync({
        id: realId,
        title: editForm.title,
        description: editForm.description || null,
        event_type: effectiveType,
        severity: editForm.severity,
        assigned_to: editForm.category === "task" && editForm.assignee !== "none" ? editForm.assignee : null,
        recurrence_type: editForm.recurrence,
        recurrence_end_date: editForm.recurrenceEnd || null,
      } as any);
      setEditingEventId(null);
      toast({ title: "Uppdaterad" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleDrop = async (targetDate: string) => {
    // Protocol item drop → open dialog to create event
    if (draggedProtocolItem) {
      setDropCreateDialog({
        targetDate,
        content: draggedProtocolItem.content,
        assignedTo: draggedProtocolItem.assigned_to,
        protocolTitle: draggedProtocolItem.protocolTitle,
        itemId: draggedProtocolItem.id,
      });
      setDropFormType("task");
      setDropFormTitle(draggedProtocolItem.content);
      setDropFormDesc(`Från mötesprotokoll: ${draggedProtocolItem.protocolTitle}`);
      setDraggedProtocolItem(null);
      setDropTarget(null);
      return;
    }
    // Normal event drag
    if (!draggedEventId) return;
    const realId = draggedEventId.includes("__rec_") ? draggedEventId.split("__rec_")[0] : draggedEventId;
    try {
      await updateEvent.mutateAsync({ id: realId, event_date: targetDate } as any);
      toast({ title: "Händelse flyttad" });
    } catch {
      toast({ title: "Kunde inte flytta", variant: "destructive" });
    }
    setDraggedEventId(null);
    setDropTarget(null);
  };

  const handleDropCreate = async () => {
    if (!dropCreateDialog || !dropFormTitle.trim()) return;
    try {
      const { data: insertedEvent } = await supabase
        .from("schedule_events" as any)
        .insert({
          title: dropFormTitle,
          event_date: dropCreateDialog.targetDate,
          event_type: dropFormType,
          severity: "info",
          portal: site,
          store_id: site === "shop" ? activeStoreId : null,
          all_day: true,
          assigned_to: dropCreateDialog.assignedTo,
          meeting_item_id: dropCreateDialog.itemId,
          description: dropFormDesc || null,
        } as any)
        .select("id")
        .single();
      if (insertedEvent) {
        await updateProtocolItem.mutateAsync({ id: dropCreateDialog.itemId, calendar_event_id: (insertedEvent as any).id, deadline: dropCreateDialog.targetDate });
      }
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
      toast({ title: "Händelse skapad från mötespunkt" });
      setDropCreateDialog(null);
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  // Protocol helpers
  const handleToggleProtocolItem = async (itemId: string, currentCompleted: boolean, calendarEventId: string | null) => {
    const newCompleted = !currentCompleted;
    await updateProtocolItem.mutateAsync({ id: itemId, completed: newCompleted });
    if (calendarEventId) {
      const realId = calendarEventId.includes("__rec_") ? calendarEventId.split("__rec_")[0] : calendarEventId;
      await supabase.from("schedule_events" as any).update({ is_done: newCompleted } as any).eq("id", realId);
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    }
  };

  const handleCreateTaskFromItem = async (item: { id: string; content: string; assigned_to: string | null; deadline: string | null }, protocolTitle: string, selectedDateForTask: string) => {
    try {
      await updateProtocolItem.mutateAsync({ id: item.id, deadline: selectedDateForTask });
      const { data: insertedEvent } = await supabase
        .from("schedule_events" as any)
        .insert({
          title: item.content,
          event_date: selectedDateForTask,
          event_type: "task",
          severity: "info",
          portal: site,
          store_id: site === "shop" ? activeStoreId : null,
          all_day: true,
          assigned_to: item.assigned_to,
          meeting_item_id: item.id,
          description: `Från mötesprotokoll: ${protocolTitle}`,
        } as any)
        .select("id")
        .single();
      if (insertedEvent) {
        await updateProtocolItem.mutateAsync({ id: item.id, calendar_event_id: (insertedEvent as any).id });
      }
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
      toast({ title: "Uppgift tillagd i kalendern" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleAddProtocolItem = async (protocolId: string) => {
    const text = newItemText[protocolId]?.trim();
    if (!text) return;
    const items = protocols?.find((p) => p.id === protocolId)?.meeting_protocol_items || [];
    await addProtocolItem.mutateAsync({
      protocol_id: protocolId,
      content: text,
      sort_order: items.length,
    });
    setNewItemText((prev) => ({ ...prev, [protocolId]: "" }));
  };

  // ── YEAR VIEW ──
  const renderYearView = () => (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
      {MONTHS.map((monthName, monthIdx) => {
        const daysInMonth = getDaysInMonth(new Date(year, monthIdx));
        const firstDay = (getDay(startOfMonth(new Date(year, monthIdx))) + 6) % 7;
        const monthPast = isDatePast(year, monthIdx);
        return (
          <div
            key={monthIdx}
            className={cn(
              "border border-border bg-card p-2 cursor-pointer hover:bg-muted/50 transition-colors",
              monthPast && "opacity-50",
            )}
            onClick={() => setExpandedMonth(monthIdx)}
          >
            <div className="text-[10px] font-bold text-foreground mb-1 tracking-wide">{monthName.toUpperCase()}</div>
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS_SHORT.map(d => (
                <div key={d} className="text-[7px] text-muted-foreground text-center">{d[0]}</div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="h-3" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                const day = dayIdx + 1;
                const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] || [];
                const holidayKey = `${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isHoliday = SWEDISH_HOLIDAYS[holidayKey];
                const isWeekend = ((firstDay + dayIdx) % 7) >= 5;
                const today = isToday(new Date(year, monthIdx, day));
                const dayPast = isDatePast(year, monthIdx, day);

                let dotColor = "";
                if (dayEvents.length > 0) {
                  dotColor = getEventDisplayColor(dayEvents[0]);
                } else if (isHoliday) {
                  dotColor = "bg-pink-500";
                }

                return (
                  <div
                    key={day}
                    className={cn(
                      "h-3 flex items-center justify-center relative text-[7px] leading-none",
                      today && "ring-1 ring-primary",
                      dayPast && !dotColor && "opacity-40",
                    )}
                    title={isHoliday || dayEvents.map(e => e.title).join(", ") || undefined}
                  >
                    {dotColor ? (
                      <div className={cn("h-2 w-2 rounded-full", dotColor, dayPast && "opacity-60")} />
                    ) : (
                      <span>{day}</span>
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
          <Button variant="outline" size="sm" onClick={() => { setExpandedMonth(null); setSelectedDate(null); }} className="text-[10px] h-7 px-2">
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
          <Button size="sm" onClick={() => openAddPanel(selectedDate || `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`)} className="text-[10px] h-7 gap-1">
            <Plus className="h-3 w-3" /> Lägg till
          </Button>
        </div>

        {(() => {
          // Build rows of cells
          const cells: { day: number; dateStr: string }[] = [];
          // Leading empty cells
          for (let i = 0; i < firstDay; i++) cells.push({ day: 0, dateStr: "" });
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            cells.push({ day: d, dateStr });
          }
          const rows: { day: number; dateStr: string }[][] = [];
          for (let i = 0; i < cells.length; i += 7) {
            const row = cells.slice(i, i + 7);
            // Pad last row
            while (row.length < 7) row.push({ day: 0, dateStr: "" });
            rows.push(row);
          }

          // Find which row contains the selected date
          const selectedRowIdx = selectedDate
            ? rows.findIndex(row => row.some(c => c.dateStr === selectedDate))
            : -1;

          return (
            <div className="border border-border">
              {/* Weekday headers */}
              <div className="grid grid-cols-7">
                {WEEKDAYS_SHORT.map(d => (
                  <div key={d} className="text-[9px] font-bold text-muted-foreground text-center py-1 bg-muted/50 border-b border-border">{d}</div>
                ))}
              </div>
              {rows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  <div className="grid grid-cols-7">
                    {row.map((cell, cellIdx) => {
                      if (cell.day === 0) {
                        return <div key={`e${cellIdx}`} className="min-h-[80px] border-b border-r border-border bg-muted/20" />;
                      }
                      const dayEvents = eventsByDate[cell.dateStr] || [];
                      const holidayKey = cell.dateStr.slice(5);
                      const holiday = SWEDISH_HOLIDAYS[holidayKey];
                      const today = isToday(new Date(year, monthIdx, cell.day));
                      const dayPast = isDatePast(year, monthIdx, cell.day);
                      const isSelected = selectedDate === cell.dateStr;
                      const hasMeeting = meetingDates.has(cell.dateStr);

                      return (
                        <div
                          key={cell.day}
                          className={cn(
                            "min-h-[80px] border-b border-r border-border p-1 cursor-pointer hover:bg-muted/30 transition-colors relative",
                            dayPast && "bg-muted/20",
                            today && "ring-1 ring-inset ring-primary",
                            isSelected && "ring-2 ring-inset ring-primary bg-primary/5",
                            dropTarget === cell.dateStr && "bg-primary/10 ring-2 ring-inset ring-primary",
                          )}
                          onClick={() => setSelectedDate(isSelected ? null : cell.dateStr)}
                          onDragOver={(e) => { e.preventDefault(); setDropTarget(cell.dateStr); }}
                          onDragLeave={() => setDropTarget(null)}
                          onDrop={(e) => { e.preventDefault(); handleDrop(cell.dateStr); }}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "text-[10px] font-medium",
                              today && "text-primary font-bold",
                              dayPast && !today && "text-muted-foreground/60",
                            )}>{cell.day}</span>
                            {dayEvents.length > 0 && (
                              <span className="text-[8px] text-muted-foreground">{dayEvents.length}</span>
                            )}
                          </div>
                          {holiday && (
                            <div className="text-[8px] text-pink-500 truncate mt-0.5">{holiday}</div>
                          )}
                          {dayEvents.slice(0, 3).map(evt => (
                            <div
                              key={evt.id}
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", evt.id); e.dataTransfer.effectAllowed = "move"; setDraggedEventId(evt.id); }}
                              onDragEnd={() => { setDraggedEventId(null); setDropTarget(null); }}
                              className={cn(
                                "text-[8px] truncate mt-0.5 px-1 rounded-sm text-white cursor-grab active:cursor-grabbing flex items-center gap-0.5",
                                getEventDisplayColor(evt),
                                draggedEventId === evt.id && "opacity-50",
                                evt.event_type === "task" && evt.is_done && "line-through",
                                dayPast && "opacity-70",
                              )}
                            >
                              {evt.event_type === "task" && evt.is_done && <Check className="h-2 w-2 shrink-0" />}
                              {evt.title}
                              <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 ml-auto", getSeverityDotColor(evt.severity))} />
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[7px] text-muted-foreground mt-0.5">+{dayEvents.length - 3} till</div>
                          )}
                          {/* Meeting protocol indicator */}
                          {hasMeeting && (
                            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted-foreground/30 rounded-b-sm" title="Mötesprotokoll" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Inline day detail splits open after this row */}
                  {rowIdx === selectedRowIdx && renderDayDetail()}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  };

  // ── INLINE DAY DETAIL PANEL ──
  const renderDayDetail = () => {
    if (!selectedDate) return null;
    const dayEvents = eventsByDate[selectedDate] || [];
    const holiday = SWEDISH_HOLIDAYS[selectedDate.slice(5)];
    const dayMeetings = meetingsForDate;

    return (
      <div className="border border-border bg-card rounded-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">
              {format(parseISO(selectedDate), "EEEE d MMMM yyyy", { locale: sv })}
            </h3>
            {holiday && (
              <Badge variant="outline" className="text-[8px] text-pink-500 border-pink-500/30">{holiday}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => openAddPanel(selectedDate)} className="text-[10px] h-7 gap-1">
              <Plus className="h-3 w-3" /> Ny
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate(null)} className="h-7 w-7 p-0">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Events & Tasks */}
        {dayEvents.length === 0 && dayMeetings.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">Inga händelser eller möten denna dag</p>
        )}

        {dayEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Händelser & Uppgifter</p>
            {dayEvents.map(evt => {
              const isEditing = editingEventId === evt.id;
              return (
                <div key={evt.id} className={cn(
                  "border border-border p-2 space-y-1 rounded-sm",
                  isTaskType(evt.event_type) && evt.is_done && "bg-emerald-500/10",
                  isTaskType(evt.event_type) && !evt.is_done && isBefore(parseISO(evt.event_date), new Date()) && "bg-red-500/10",
                )}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="text-xs h-7" />
                      <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Beskrivning" className="text-xs h-7" />
                      <div className="flex gap-2">
                        <Select value={editForm.category} onValueChange={(v: "event" | "task") => setEditForm(f => ({ ...f, category: v }))}>
                          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="event" className="text-[10px]">
                              <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" />Händelse</span>
                            </SelectItem>
                            <SelectItem value="task" className="text-[10px]">
                              <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-purple-500" />Uppgift</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {editForm.category === "event" && (
                          <Select value={editForm.type} onValueChange={v => setEditForm(f => ({ ...f, type: v }))}>
                            <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {EVENT_TYPES.filter(t => t.value !== "task").map(t => (
                                <SelectItem key={t.value} value={t.value} className="text-[10px]">
                                  <span className="flex items-center gap-1"><div className={cn("h-1.5 w-1.5 rounded-full", t.color)} />{t.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Select value={editForm.severity} onValueChange={v => setEditForm(f => ({ ...f, severity: v }))}>
                          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SEVERITY_LEVELS.map(s => (
                              <SelectItem key={s.value} value={s.value} className="text-[10px]">
                                <span className="flex items-center gap-1"><div className={cn("h-1.5 w-1.5 rounded-full", s.color)} />{s.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {editForm.category === "task" && (
                        <Select value={editForm.assignee} onValueChange={v => setEditForm(f => ({ ...f, assignee: v }))}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Tilldelad" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-[10px]">Ingen</SelectItem>
                            {staffMembers?.map(s => (
                              <SelectItem key={s.id} value={s.id} className="text-[10px]">{s.first_name} {s.last_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditingEventId(null)} className="text-[10px] h-6">Avbryt</Button>
                        <Button size="sm" onClick={() => saveEdit(evt)} className="text-[10px] h-6">Spara</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            checked={evt.is_done}
                            onCheckedChange={() => handleToggleDone(evt)}
                            className="shrink-0"
                          />
                          <div className={cn("h-2 w-2 rounded-full shrink-0", getEventDisplayColor(evt))} />
                          <span className={cn("text-xs font-medium", evt.is_done && "line-through text-muted-foreground")}>
                            {evt.title}
                          </span>
                          {evt.recurrence_type && evt.recurrence_type !== "none" && (
                            <Repeat className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={cn("text-[7px] px-1 py-0", isTaskType(evt.event_type) ? "text-purple-400 border-purple-400/30" : "")}>
                            {isTaskType(evt.event_type) ? "Uppgift" : "Händelse"}
                          </Badge>
                          <div className={cn("h-2 w-2 rounded-full shrink-0", getSeverityDotColor(evt.severity))} title={SEVERITY_LEVELS.find(s => s.value === evt.severity)?.label} />
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEditing(evt)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground" onClick={() => copyEvent(evt, selectedDate || undefined)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(evt.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {evt.description && <p className="text-[10px] text-muted-foreground ml-6">{evt.description}</p>}
                      <div className="flex items-center gap-2 pt-0.5 ml-6">
                        {isTaskType(evt.event_type) && evt.staff && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            {evt.staff.first_name} {evt.staff.last_name.charAt(0)}.
                          </span>
                        )}
                        {!isTaskType(evt.event_type) && (
                          <Badge variant="secondary" className="text-[7px]">{getEventTypeInfo(evt.event_type).label}</Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Meeting Protocols for this date */}
        {site === "shop" && activeStoreId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileText className="h-3 w-3" /> Mötesprotokoll
              </p>
            </div>
            {dayMeetings.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Inga mötesprotokoll för denna dag</p>
            )}
            {dayMeetings.map(p => {
              const items = p.meeting_protocol_items || [];
              const completedCount = items.filter(i => i.completed).length;
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{p.title || "Utan titel"}</span>
                      <Badge variant="secondary" className="text-[8px]">{completedCount}/{items.length} klara</Badge>
                      {p.attendees && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" /> {p.attendees}
                        </span>
                      )}
                    </div>
                    <Textarea
                      placeholder="Anteckningar..."
                      className="text-xs min-h-[40px] mb-2"
                      defaultValue={p.notes || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (p.notes || "")) {
                          updateProtocol.mutate({ id: p.id, notes: e.target.value });
                        }
                      }}
                    />
                    <div className="space-y-1">
                      <p className="text-[9px] font-medium text-muted-foreground">Punkter</p>
                      {items.sort((a, b) => a.sort_order - b.sort_order).map(item => (
                        <div
                          key={item.id}
                          className="group min-h-[28px] items-center gap-x-1"
                          style={{ display: 'grid', gridTemplateColumns: '18px 1fr minmax(60px, auto) minmax(44px, auto) 24px' }}
                          draggable={!item.calendar_event_id}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/plain", item.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDraggedProtocolItem({
                              id: item.id,
                              content: item.content,
                              assigned_to: item.assigned_to,
                              deadline: item.deadline,
                              protocolTitle: p.title,
                            });
                          }}
                          onDragEnd={() => { setDraggedProtocolItem(null); setDropTarget(null); }}
                        >
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => handleToggleProtocolItem(item.id, item.completed, item.calendar_event_id)}
                            className="shrink-0"
                          />
                          <EditableText
                            value={item.content}
                            completed={item.completed}
                            onSave={(val) => updateProtocolItem.mutate({ id: item.id, content: val })}
                            className="flex-1 text-xs"
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn("h-7 px-1.5 text-[10px] max-w-full overflow-hidden", !item.assigned_to && "opacity-0 group-hover:opacity-100")}
                              >
                                <UserCheck className="h-3 w-3 mr-0.5" />
                                {item.staff ? `${item.staff.first_name} ${item.staff.last_name.charAt(0)}.` : "Tilldela"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-1" align="end">
                              <div className="space-y-0.5">
                                {item.assigned_to && (
                                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-destructive" onClick={() => updateProtocolItem.mutate({ id: item.id, assigned_to: null })}>
                                    Ta bort
                                  </Button>
                                )}
                                {staffMembers?.map(s => (
                                  <Button
                                    key={s.id}
                                    variant={item.assigned_to === s.id ? "secondary" : "ghost"}
                                    size="sm"
                                    className="w-full justify-start text-xs"
                                    onClick={() => updateProtocolItem.mutate({ id: item.id, assigned_to: s.id })}
                                  >
                                    {s.first_name} {s.last_name}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="flex items-center justify-end">
                            {item.calendar_event_id ? (
                              <span className="text-[9px] text-purple-400 flex items-center gap-0.5 px-1">
                                <CalendarIcon className="h-3 w-3" />
                                {item.deadline ? format(parseISO(item.deadline), "d/M") : ""}
                              </span>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-6 px-1.5 text-[10px]", !item.deadline && "opacity-0 group-hover:opacity-100")}
                                    title="Välj datum & lägg till i kalendern"
                                  >
                                    <CalendarPlus className="h-3 w-3 mr-0.5 text-purple-400" />
                                    {item.deadline ? format(parseISO(item.deadline), "d/M") : "Datum"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                  <CalendarPicker
                                    mode="single"
                                    selected={item.deadline ? parseISO(item.deadline) : undefined}
                                    onSelect={(date: Date | undefined) => {
                                      if (date) {
                                        handleCreateTaskFromItem(item, p.title, format(date, "yyyy-MM-dd"));
                                      }
                                    }}
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <div className="flex items-center justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={() => deleteProtocolItem.mutate(item.id)}
                            >
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-1">
                        <Input
                          className="h-7 text-xs flex-1"
                          placeholder="Lägg till punkt..."
                          value={newItemText[p.id] || ""}
                          onChange={(e) => setNewItemText(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleAddProtocolItem(p.id)}
                        />
                        <Button size="sm" variant="outline" className="h-7" onClick={() => handleAddProtocolItem(p.id)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── LEGEND ──
  const renderLegend = () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={categoryFilter === "all" ? "default" : "outline"}
        className="text-[8px] px-1.5 py-0.5 cursor-pointer"
        onClick={() => setCategoryFilter("all")}
      >
        Alla
      </Badge>
      {CATEGORY_FILTERS.map(c => (
        <Badge
          key={c.value}
          variant={categoryFilter === c.value ? "default" : "outline"}
          className={cn("text-[8px] gap-1 px-1.5 py-0.5 cursor-pointer", categoryFilter !== c.value && "opacity-60")}
          onClick={() => setCategoryFilter(categoryFilter === c.value ? "all" : c.value)}
        >
          <div className={cn("h-1.5 w-1.5 rounded-full", c.color)} />
          {c.label}
        </Badge>
      ))}
      <div className="h-3 w-px bg-border mx-1" />
      {EVENT_TYPES.filter(t => t.value !== "task").map(t => (
        <span key={t.value} className="flex items-center gap-0.5 text-[7px] text-muted-foreground">
          <div className={cn("h-1.5 w-1.5 rounded-full", t.color)} />
          {t.label}
        </span>
      ))}
    </div>
  );

  const renderAddForm = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-x-2 gap-y-1">
      <div>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">KATEGORI</label>
        <Select value={formCategory} onValueChange={(v: "event" | "task") => setFormCategory(v)}>
          <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="event" className="text-[10px]">
              <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" />Händelse</span>
            </SelectItem>
            <SelectItem value="task" className="text-[10px]">
              <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-purple-500" />Uppgift</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">DATUM</label>
        <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="text-[10px] h-6 px-1.5" />
      </div>
      <div>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">TITEL</label>
        <Input placeholder="Titel" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="text-[10px] h-6 px-1.5" autoFocus />
      </div>
      {formCategory === "event" && (
        <div>
          <label className="text-[8px] text-muted-foreground font-medium leading-none">TYP</label>
          <Select value={formType} onValueChange={setFormType}>
            <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.filter(t => t.value !== "task").map(t => (
                <SelectItem key={t.value} value={t.value} className="text-[10px]">
                  <span className="flex items-center gap-1"><div className={cn("h-1.5 w-1.5 rounded-full", t.color)} />{t.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">PRIORITET</label>
        <Select value={formSeverity} onValueChange={setFormSeverity}>
          <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SEVERITY_LEVELS.map(s => (
              <SelectItem key={s.value} value={s.value} className="text-[10px]">
                <span className="flex items-center gap-1"><div className={cn("h-1.5 w-1.5 rounded-full", s.color)} />{s.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">UPPREPNING</label>
        <Select value={formRecurrence} onValueChange={setFormRecurrence}>
          <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RECURRENCE_OPTIONS.map(r => (
              <SelectItem key={r.value} value={r.value} className="text-[10px]">
                <span className="flex items-center gap-1">
                  {r.value !== "none" && <Repeat className="h-2.5 w-2.5 text-muted-foreground" />}
                  {r.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {formRecurrence !== "none" && (
        <div>
          <label className="text-[8px] text-muted-foreground font-medium leading-none">SLUTAR</label>
          <Input type="date" value={formRecurrenceEnd} onChange={e => setFormRecurrenceEnd(e.target.value)} className="text-[10px] h-6 px-1.5" />
        </div>
      )}
      {formCategory === "task" && (
        <div>
          <label className="text-[8px] text-muted-foreground font-medium leading-none">TILLDELAD</label>
          <Select value={formAssignee} onValueChange={setFormAssignee}>
            <SelectTrigger className="h-6 text-[10px] px-1.5"><SelectValue placeholder="Välj" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-[10px]">Ingen</SelectItem>
              {staffMembers?.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-[10px]">{s.first_name} {s.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={cn("col-span-2", formCategory === "event" && formRecurrence === "none" ? "md:col-span-2" : "md:col-span-2")}>
        <label className="text-[8px] text-muted-foreground font-medium leading-none">BESKRIVNING</label>
        <Input placeholder="Valfritt" value={formDesc} onChange={e => setFormDesc(e.target.value)} className="text-[10px] h-6 px-1.5" />
      </div>
      <div className="flex items-end col-span-2 md:col-span-1">
        <Button size="sm" onClick={handleAdd} disabled={!formTitle.trim() || addEvent.isPending} className="text-[9px] h-6 w-full px-2">
          {addEvent.isPending ? "Sparar..." : "Spara"}
        </Button>
      </div>
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
          <Button variant="ghost" size="sm" onClick={() => { setYear(new Date().getFullYear()); setExpandedMonth(null); setSelectedDate(null); }} className="text-[10px] h-7 px-2">
            Idag
          </Button>
        </div>
      </div>

      {/* Legend */}
      {renderLegend()}

      {/* Inline add panel */}
      <Collapsible open={showAddPanel} onOpenChange={setShowAddPanel}>
        <CollapsibleContent>
          <div className="border border-border bg-card px-3 py-2 rounded-sm">
            {renderAddForm()}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Main calendar */}
      {expandedMonth === null ? renderYearView() : renderMonthView(expandedMonth)}

      {/* Drop-create dialog for protocol items dragged to a day */}
      <Dialog open={!!dropCreateDialog} onOpenChange={(open) => { if (!open) setDropCreateDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Skapa händelse från mötespunkt</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <label className="text-[9px] text-muted-foreground font-medium">DATUM</label>
              <p className="text-xs font-medium">{dropCreateDialog && format(parseISO(dropCreateDialog.targetDate), "EEEE d MMMM yyyy", { locale: sv })}</p>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-medium">TYP</label>
              <Select value={dropFormType} onValueChange={setDropFormType}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      <span className="flex items-center gap-1"><div className={cn("h-1.5 w-1.5 rounded-full", t.color)} />{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-medium">TITEL</label>
              <Input value={dropFormTitle} onChange={e => setDropFormTitle(e.target.value)} className="text-xs h-7" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground font-medium">BESKRIVNING</label>
              <Input value={dropFormDesc} onChange={e => setDropFormDesc(e.target.value)} className="text-xs h-7" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDropCreateDialog(null)} className="text-xs">Avbryt</Button>
            <Button size="sm" onClick={handleDropCreate} disabled={!dropFormTitle.trim()} className="text-xs">Skapa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
