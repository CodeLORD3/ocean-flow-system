import { useEffect, useState } from "react";
import { CalendarClock, Save, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/hooks/useStaff";
import { useDeletePlannedShift, useSavePlannedShift } from "@/hooks/usePlannedShifts";
import type { PlannedShiftRow } from "@/lib/liveStaff";

/** Lägg till eller ändra ett planerat pass för en butik och ett datum. */
export function PlannedShiftDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  day,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeId: string;
  storeName: string;
  day: string;
  editing?: PlannedShiftRow | null;
}) {
  const { data: staff = [] } = useStaff(storeId);
  const save = useSavePlannedShift();
  const remove = useDeletePlannedShift();
  const { toast } = useToast();

  const [staffId, setStaffId] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setStaffId(editing?.staff_id ?? "");
    setStart(editing?.start_time?.slice(0, 5) ?? "09:00");
    setEnd(editing?.end_time?.slice(0, 5) ?? "17:00");
    setNote(editing?.note ?? "");
  }, [open, editing]);

  const handleSave = () => {
    if (!staffId) {
      toast({ title: "Välj personal", variant: "destructive" });
      return;
    }
    if (start >= end) {
      toast({ title: "Passet slutar innan det börjar", variant: "destructive" });
      return;
    }
    save.mutate(
      { id: editing?.id, staff_id: staffId, store_id: storeId, shift_date: day, start_time: start, end_time: end, note },
      {
        onSuccess: () => {
          toast({ title: editing ? "Pass uppdaterat" : "Pass planerat", description: `${storeName} ${day}` });
          onOpenChange(false);
        },
        onError: (e: any) => toast({ title: "Fel", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            {editing ? "Ändra planerat pass" : "Nytt planerat pass"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Personal</Label>
            <Select value={staffId} onValueChange={setStaffId} disabled={!!editing}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Välj person" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Start</Label>
              <Input type="time" className="h-8 text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Slut</Label>
              <Input type="time" className="h-8 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Anteckning</Label>
            <Input className="h-8 text-xs" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive"
              onClick={() =>
                remove.mutate(editing.id, {
                  onSuccess: () => {
                    toast({ title: "Passet togs bort" });
                    onOpenChange(false);
                  },
                })
              }
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Ta bort
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
