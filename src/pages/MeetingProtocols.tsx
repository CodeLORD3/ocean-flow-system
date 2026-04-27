import { useState, useRef } from "react";
import { EditableText } from "@/components/EditableText";
import { supabase } from "@/integrations/supabase/client";
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
import { useScheduleEvents } from "@/hooks/useScheduleEvents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Calendar as CalendarIcon, FileText, CalendarPlus, UserCheck, ListTodo } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function MeetingProtocols() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const isShop = site === "shop";
  const { data: protocols, isLoading } = useMeetingProtocols(isShop ? activeStoreId : null, isShop ? undefined : site);
  const createProtocol = useCreateMeetingProtocol();
  const updateProtocol = useUpdateMeetingProtocol();
  const deleteProtocol = useDeleteMeetingProtocol();
  const addItem = useAddProtocolItem();
  const updateItem = useUpdateProtocolItem();
  const deleteItem = useDeleteProtocolItem();
  const { updateEvent } = useScheduleEvents(site, undefined, isShop ? activeStoreId : null);
  const { data: staffMembers } = useStaff(isShop ? (activeStoreId || undefined) : undefined);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newAttendees, setNewAttendees] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

  if (isShop && !activeStoreId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Mötesprotokoll</h1>
        <p className="text-muted-foreground">Välj en butik för att se mötesprotokoll.</p>
      </div>
    );
  }

  const portalLabel = isShop ? activeStoreName : site === "wholesale" ? "Grossist" : site === "production" ? "Produktion" : "";

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createProtocol.mutateAsync({
      store_id: isShop ? activeStoreId : null,
      portal: site,
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

  const handleToggleCompleted = async (itemId: string, currentCompleted: boolean, calendarEventId: string | null) => {
    const newCompleted = !currentCompleted;
    await updateItem.mutateAsync({ id: itemId, completed: newCompleted });
    // Sync to calendar event if linked
    if (calendarEventId) {
      const realId = calendarEventId.includes("__rec_") ? calendarEventId.split("__rec_")[0] : calendarEventId;
      await supabase.from("schedule_events" as any).update({ is_done: newCompleted } as any).eq("id", realId);
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    }
  };

  const handleCreateTask = async (item: { id: string; content: string; assigned_to: string | null; deadline: string | null }, protocolTitle: string, selectedDate: string) => {
    try {
      // Update deadline on the protocol item
      await updateItem.mutateAsync({ id: item.id, deadline: selectedDate });

      // Create calendar event
      const { data: insertedEvent } = await supabase
        .from("schedule_events" as any)
        .insert({
          title: item.content,
          event_date: selectedDate,
          event_type: "task",
          severity: "info",
          portal: "shop",
          store_id: activeStoreId,
          all_day: true,
          assigned_to: item.assigned_to,
          meeting_item_id: item.id,
          description: `Från mötesprotokoll: ${protocolTitle}`,
        } as any)
        .select("id")
        .single();

      if (insertedEvent) {
        await updateItem.mutateAsync({ id: item.id, calendar_event_id: (insertedEvent as any).id });
      }
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
      toast({ title: "Uppgift tillagd i kalendern" });
    } catch {
      toast({ title: "Fel", variant: "destructive" });
    }
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
          const hasCalendarLinks = items.some(i => i.calendar_event_id);
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
                    {hasCalendarLinks && (
                      <Badge variant="outline" className="text-[9px] shrink-0 text-purple-400 border-purple-400/30 gap-1">
                        <ListTodo className="h-3 w-3" /> Uppgifter
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
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
                        <div key={item.id} className="group min-h-[32px] items-center gap-x-1" style={{ display: 'grid', gridTemplateColumns: '20px 1fr minmax(70px, auto) minmax(50px, auto) 28px' }}>
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => handleToggleCompleted(item.id, item.completed, item.calendar_event_id)}
                            className="shrink-0"
                          />
                          <EditableText
                            value={item.content}
                            completed={item.completed}
                            onSave={(val) => updateItem.mutate({ id: item.id, content: val })}
                            className="flex-1 text-sm"
                          />
                          {/* Assignee selector */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn("h-7 px-1.5 text-xs max-w-full overflow-hidden", item.assigned_to ? '' : 'opacity-0 group-hover:opacity-100')}
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
                          <div className="flex items-center justify-end">
                            {item.calendar_event_id ? (
                              <span className="flex items-center gap-1 text-[10px] text-purple-400 px-1" title="Uppgift i kalendern">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                {item.deadline ? format(parseISO(item.deadline), "d/M") : ""}
                              </span>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-7 px-2 text-xs", !item.deadline && "opacity-0 group-hover:opacity-100")}
                                    title="Välj datum & lägg till i kalendern"
                                  >
                                    <CalendarPlus className="h-3.5 w-3.5 mr-1 text-purple-400" />
                                    {item.deadline ? format(parseISO(item.deadline), "d/M") : "Datum"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                  <CalendarPicker
                                    mode="single"
                                    selected={item.deadline ? parseISO(item.deadline) : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        handleCreateTask(item, p.title, format(date, "yyyy-MM-dd"));
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
    </div>
  );
}
