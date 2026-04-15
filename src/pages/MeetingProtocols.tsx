import { useState } from "react";
import { useSite } from "@/contexts/SiteContext";
import {
  useMeetingProtocols,
  useCreateMeetingProtocol,
  useUpdateMeetingProtocol,
  useDeleteMeetingProtocol,
  useAddProtocolItem,
  useUpdateProtocolItem,
  useDeleteProtocolItem,
} from "@/hooks/useMeetingProtocols";
import { useStaff } from "@/hooks/useStaff";
import { useScheduleEvents, EVENT_TYPES, SEVERITY_LEVELS, RECURRENCE_OPTIONS } from "@/hooks/useScheduleEvents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Calendar, FileText, CalendarPlus, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

export default function MeetingProtocols() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: protocols, isLoading } = useMeetingProtocols(activeStoreId);
  const createProtocol = useCreateMeetingProtocol();
  const updateProtocol = useUpdateMeetingProtocol();
  const deleteProtocol = useDeleteMeetingProtocol();
  const addItem = useAddProtocolItem();
  const updateItem = useUpdateProtocolItem();
  const deleteItem = useDeleteProtocolItem();
  const { addEvent } = useScheduleEvents("shop", undefined, activeStoreId);
  const { data: staffMembers } = useStaff(activeStoreId || undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newAttendees, setNewAttendees] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  // Calendar dialog state
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [calType, setCalType] = useState("meeting");
  const [calSeverity, setCalSeverity] = useState("info");
  const [calAllDay, setCalAllDay] = useState(true);
  const [calStartTime, setCalStartTime] = useState("09:00");
  const [calEndTime, setCalEndTime] = useState("10:00");
  const [calDescription, setCalDescription] = useState("");
  const [calRecurrence, setCalRecurrence] = useState("none");

  if (!activeStoreId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Mötesprotokoll</h1>
        <p className="text-muted-foreground">Välj en butik för att se mötesprotokoll.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createProtocol.mutateAsync({
      store_id: activeStoreId,
      title: newTitle,
      meeting_date: newDate,
      attendees: newAttendees || undefined,
    });
    setNewTitle("");
    setNewDate(format(new Date(), "yyyy-MM-dd"));
    setNewAttendees("");
    setDialogOpen(false);
    toast({ title: "Möte skapat" });
  };

  const handleAddItem = async (protocolId: string) => {
    const text = newItemText[protocolId]?.trim();
    if (!text) return;
    const items = protocols?.find((p) => p.id === protocolId)?.meeting_protocol_items || [];
    await addItem.mutateAsync({
      protocol_id: protocolId,
      content: text,
      sort_order: items.length,
    });
    setNewItemText((prev) => ({ ...prev, [protocolId]: "" }));
  };

  const openCalendarDialog = (itemContent: string) => {
    setCalTitle(itemContent);
    setCalDate(format(new Date(), "yyyy-MM-dd"));
    setCalType("meeting");
    setCalSeverity("info");
    setCalAllDay(true);
    setCalStartTime("09:00");
    setCalEndTime("10:00");
    setCalDescription("");
    setCalRecurrence("none");
    setCalDialogOpen(true);
  };

  const handleAddToCalendar = async () => {
    if (!calTitle.trim() || !calDate) return;
    await addEvent.mutateAsync({
      title: calTitle,
      event_date: calDate,
      event_type: calType,
      severity: calSeverity,
      portal: "shop",
      store_id: activeStoreId,
      all_day: calAllDay,
      start_time: calAllDay ? undefined : calStartTime,
      end_time: calAllDay ? undefined : calEndTime,
      description: calDescription || undefined,
      recurrence_type: calRecurrence,
    });
    setCalDialogOpen(false);
    toast({ title: "Tillagd i kalendern" });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mötesprotokoll</h1>
          <p className="text-sm text-muted-foreground">{activeStoreName}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nytt möte</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Skapa mötesprotokoll</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Mötets titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <Input placeholder="Deltagare (valfritt)" value={newAttendees} onChange={(e) => setNewAttendees(e.target.value)} />
              <Button onClick={handleCreate} disabled={!newTitle.trim() || createProtocol.isPending} className="w-full">
                Skapa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">Laddar...</p>}

      {protocols?.length === 0 && !isLoading && (
        <p className="text-muted-foreground">Inga mötesprotokoll ännu.</p>
      )}

      <div className="space-y-2">
        {protocols?.map((p) => {
          const expanded = expandedId === p.id;
          const items = p.meeting_protocol_items || [];
          const completedCount = items.filter((i) => i.completed).length;
          return (
            <Card key={p.id} className="overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : p.id)}
              >
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.title || "Utan titel"}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {items.length} punkter
                    </Badge>
                    {items.length > 0 && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {completedCount}/{items.length} klara
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(p.meeting_date), "d MMM yyyy", { locale: sv })}
                    </span>
                    {p.attendees && (
                      <span className="flex items-center gap-1 truncate">
                        <Users className="h-3 w-3" />
                        {p.attendees}
                      </span>
                    )}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 ml-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ta bort mötesprotokoll</AlertDialogTitle>
                      <AlertDialogDescription>
                        Är du säker på att du vill ta bort "{p.title || "Utan titel"}"? Alla punkter i protokollet kommer också att tas bort. Denna åtgärd kan inte ångras.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Avbryt</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteProtocol.mutate(p.id)}
                      >
                        Ta bort
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {expanded && (
                <CardContent className="pt-0 pb-3 px-4 border-t space-y-3">
                  <Textarea
                    placeholder="Allmänna anteckningar..."
                    className="text-sm min-h-[60px]"
                    defaultValue={p.notes || ""}
                    onBlur={(e) => {
                      if (e.target.value !== (p.notes || "")) {
                        updateProtocol.mutate({ id: p.id, notes: e.target.value });
                      }
                    }}
                  />

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Punkter
                    </p>
                    {items
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <div key={item.id} className="flex items-start gap-2 group">
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={(checked) =>
                              updateItem.mutate({ id: item.id, completed: !!checked })
                            }
                            className="mt-0.5"
                          />
                          <Input
                            className={`flex-1 h-8 text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}
                            defaultValue={item.content}
                            onBlur={(e) => {
                              if (e.target.value !== item.content) {
                                updateItem.mutate({ id: item.id, content: e.target.value });
                              }
                            }}
                          />
                          {/* Assignee selector */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs shrink-0 ${item.assigned_to ? '' : 'opacity-0 group-hover:opacity-100'}`}
                                title="Tilldela person"
                              >
                                <UserCheck className="h-3.5 w-3.5 mr-1" />
                                {item.staff
                                  ? `${item.staff.first_name} ${item.staff.last_name.charAt(0)}.`
                                  : "Tilldela"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-1" align="end">
                              <div className="space-y-0.5">
                                {item.assigned_to && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs text-destructive"
                                    onClick={() => updateItem.mutate({ id: item.id, assigned_to: null })}
                                  >
                                    Ta bort tilldelning
                                  </Button>
                                )}
                                {staffMembers?.map((s) => (
                                  <Button
                                    key={s.id}
                                    variant={item.assigned_to === s.id ? "secondary" : "ghost"}
                                    size="sm"
                                    className="w-full justify-start text-xs"
                                    onClick={() => updateItem.mutate({ id: item.id, assigned_to: s.id })}
                                  >
                                    {s.first_name} {s.last_name}
                                  </Button>
                                ))}
                                {(!staffMembers || staffMembers.length === 0) && (
                                  <p className="text-xs text-muted-foreground p-2">Ingen personal hittad</p>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="flex items-center gap-1 ml-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            title="Lägg till i kalender"
                            onClick={() => openCalendarDialog(item.content)}
                          >
                            <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                          </div>
                        </div>
                      ))}
                    <div className="flex gap-2 mt-1">
                      <Input
                        className="h-8 text-sm flex-1"
                        placeholder="Lägg till punkt..."
                        value={newItemText[p.id] || ""}
                        onChange={(e) => setNewItemText((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleAddItem(p.id)}
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={() => handleAddItem(p.id)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add to Calendar Dialog */}
      <Dialog open={calDialogOpen} onOpenChange={setCalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5" /> Lägg till i kalender
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Datum</label>
              <Input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Typ</label>
                <Select value={calType} onValueChange={setCalType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Prioritet</label>
                <Select value={calSeverity} onValueChange={setCalSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cal-allday"
                checked={calAllDay}
                onCheckedChange={(v) => setCalAllDay(!!v)}
              />
              <label htmlFor="cal-allday" className="text-sm">Heldag</label>
            </div>
            {!calAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Starttid</label>
                  <Input type="time" value={calStartTime} onChange={(e) => setCalStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Sluttid</label>
                  <Input type="time" value={calEndTime} onChange={(e) => setCalEndTime(e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Upprepning</label>
              <Select value={calRecurrence} onValueChange={setCalRecurrence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Beskrivning</label>
              <Textarea
                value={calDescription}
                onChange={(e) => setCalDescription(e.target.value)}
                placeholder="Valfri beskrivning..."
                className="min-h-[60px]"
              />
            </div>
            <Button onClick={handleAddToCalendar} disabled={!calTitle.trim() || !calDate || addEvent.isPending} className="w-full">
              <CalendarPlus className="h-4 w-4 mr-1" /> Lägg till i kalender
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
