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
  MeetingProtocol,
} from "@/hooks/useMeetingProtocols";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Calendar, FileText } from "lucide-react";
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newAttendees, setNewAttendees] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});

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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Ta bort detta mötesprotokoll?")) {
                      deleteProtocol.mutate(p.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              {expanded && (
                <CardContent className="pt-0 pb-3 px-4 border-t space-y-3">
                  {/* Notes */}
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

                  {/* Items */}
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
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
