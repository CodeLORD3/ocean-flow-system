import { useState, useMemo } from "react";
import { format, parseISO, isBefore, isToday } from "date-fns";
import { sv } from "date-fns/locale";
import { Plus, Check, CheckCircle2, Circle, Calendar, Users, FileText, Trash2, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScheduleEvents, type ScheduleEvent } from "@/hooks/useScheduleEvents";
import { useMeetingProtocols, useUpdateProtocolItem } from "@/hooks/useMeetingProtocols";
import { useStaff } from "@/hooks/useStaff";
import { useSite } from "@/contexts/SiteContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type TaskStatus = "active" | "done" | "overdue";

function getTaskStatus(event: ScheduleEvent): TaskStatus {
  if (event.is_done) return "done";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = parseISO(event.event_date);
  if (isBefore(eventDate, today)) return "overdue";
  return "active";
}

export default function Tasks() {
  const { site, activeStoreId } = useSite();
  const { events, isLoading, addEvent, updateEvent, deleteEvent } = useScheduleEvents(site, undefined, site === "shop" ? activeStoreId : null);
  const { data: protocols } = useMeetingProtocols(activeStoreId);
  const { data: staffMembers } = useStaff(activeStoreId || undefined);
  const updateProtocolItem = useUpdateProtocolItem();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<ScheduleEvent | null>(null);
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formAssignee, setFormAssignee] = useState<string>("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const tasks = useMemo(() => {
    return events
      .filter(e => e.event_type === "task")
      .filter(e => !e.id.includes("__rec_")) // only real events
      .map(e => ({
        ...e,
        status: getTaskStatus(e),
        source: e.meeting_item_id ? "meeting" : "calendar",
      }));
  }, [events]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterPerson !== "all") result = result.filter(t => t.assigned_to === filterPerson);
    if (filterStatus !== "all") result = result.filter(t => t.status === filterStatus);
    if (filterSource !== "all") result = result.filter(t => t.source === filterSource);
    // Sort: overdue first, then active, then done. Within group, sort by date
    const order = { overdue: 0, active: 1, done: 2 };
    return result.sort((a, b) => {
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return a.event_date.localeCompare(b.event_date);
    });
  }, [tasks, filterPerson, filterStatus, filterSource]);

  const toggleDone = async (task: typeof tasks[0]) => {
    const realId = task.id.includes("__rec_") ? task.id.split("__rec_")[0] : task.id;
    const newDone = !task.is_done;
    try {
      await updateEvent.mutateAsync({ id: realId, is_done: newDone } as any);
      // Sync to meeting protocol item if linked
      if (task.meeting_item_id) {
        await updateProtocolItem.mutateAsync({ id: task.meeting_item_id, completed: newDone });
      }
      toast({ title: newDone ? "Uppgift markerad som klar" : "Uppgift återöppnad" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDeadline) return;
    try {
      await addEvent.mutateAsync({
        event_date: formDeadline,
        title: formTitle,
        description: formDesc || undefined,
        event_type: "task",
        severity: "info",
        portal: site,
        store_id: site === "shop" ? activeStoreId : null,
        assigned_to: formAssignee && formAssignee !== "none" ? formAssignee : null,
      });
      toast({ title: "Uppgift skapad" });
      setShowCreate(false);
      resetForm();
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleEdit = async () => {
    if (!editEvent || !formTitle.trim()) return;
    const realId = editEvent.id.includes("__rec_") ? editEvent.id.split("__rec_")[0] : editEvent.id;
    try {
      await updateEvent.mutateAsync({
        id: realId,
        title: formTitle,
        description: formDesc || null,
        event_date: formDeadline,
        assigned_to: formAssignee && formAssignee !== "none" ? formAssignee : null,
      } as any);
      toast({ title: "Uppgift uppdaterad" });
      setEditEvent(null);
      resetForm();
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEvent.mutateAsync(id);
      toast({ title: "Uppgift borttagen" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormAssignee("none");
    setFormDeadline(format(new Date(), "yyyy-MM-dd"));
    setFormDesc("");
  };

  const openEdit = (task: typeof tasks[0]) => {
    setFormTitle(task.title);
    setFormAssignee(task.assigned_to || "");
    setFormDeadline(task.event_date);
    setFormDesc(task.description || "");
    setEditEvent(task);
  };

  // Find meeting title for source display
  const getMeetingSource = (meetingItemId: string | null) => {
    if (!meetingItemId || !protocols) return null;
    for (const p of protocols) {
      const item = p.meeting_protocol_items?.find(i => i.id === meetingItemId);
      if (item) return { protocolTitle: p.title, meetingDate: p.meeting_date };
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Uppgifter</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Ny uppgift
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterPerson} onValueChange={setFilterPerson}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Tilldelad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla personer</SelectItem>
            {staffMembers?.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="done">Klar</SelectItem>
            <SelectItem value="overdue">Försenad</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Källa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla källor</SelectItem>
            <SelectItem value="calendar">Kalender</SelectItem>
            <SelectItem value="meeting">Mötesprotokoll</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
          <span>{filteredTasks.length} uppgifter</span>
          <span>({tasks.filter(t => t.status === "done").length} klara)</span>
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <p className="text-muted-foreground">Laddar...</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Inga uppgifter att visa.</p>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => {
            const meeting = getMeetingSource(task.meeting_item_id);
            const isDueToday = isToday(parseISO(task.event_date));
            return (
              <Card
                key={task.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  task.status === "done" && "bg-muted/40 opacity-70",
                  task.status === "overdue" && "bg-red-500/10 border-red-500/30",
                  isDueToday && task.status === "active" && "bg-amber-500/10 border-amber-500/30",
                  task.status === "active" && !isDueToday && "border-l-4 border-l-purple-500",
                )}
              >
                <button onClick={() => toggleDone(task)} className="shrink-0">
                  {task.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className={cn("h-5 w-5", task.status === "overdue" ? "text-red-400" : "text-muted-foreground")} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn("font-medium text-sm truncate", task.status === "done" && "line-through text-muted-foreground")}>
                    {task.title}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(task.event_date), "d MMM yyyy", { locale: sv })}
                    </span>
                    {task.staff && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {task.staff.first_name} {task.staff.last_name.charAt(0)}.
                      </span>
                    )}
                    {meeting && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <FileText className="h-3 w-3" />
                        {meeting.protocolTitle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {task.status === "overdue" && <Badge variant="destructive" className="text-[9px] px-1.5">Försenad</Badge>}
                  {isDueToday && task.status === "active" && <Badge className="text-[9px] px-1.5 bg-amber-500">Idag</Badge>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(task.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showCreate || !!editEvent} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditEvent(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEvent ? "Redigera uppgift" : "Ny uppgift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Vad ska göras?" autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium">Tilldelad person</label>
              <Select value={formAssignee} onValueChange={setFormAssignee}>
                <SelectTrigger><SelectValue placeholder="Välj person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  {staffMembers?.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Deadline</label>
              <Input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Beskrivning</label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Valfri beskrivning..." className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditEvent(null); resetForm(); }}>Avbryt</Button>
            <Button onClick={editEvent ? handleEdit : handleCreate} disabled={!formTitle.trim() || !formDeadline}>
              {editEvent ? "Spara" : "Skapa uppgift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
