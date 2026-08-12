import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { shiftTimeValue, timeOnDayToIso, useUpdateShift } from "@/hooks/useStaffShifts";
import type { ActualShiftRow } from "@/lib/liveStaff";

/** Admin rättar in-/uttid eller flyttar passet till en annan enhet. */
export function ShiftEditDialog({
  open,
  onOpenChange,
  shift,
  staffName,
  day,
  stores,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: ActualShiftRow | null;
  staffName: string;
  day: string;
  stores: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const { staff } = useStaffAuth();
  const update = useUpdateShift();

  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    if (!shift) return;
    setInTime(shiftTimeValue(shift.clocked_in_at));
    setOutTime(shiftTimeValue(shift.clocked_out_at));
    setStoreId(shift.store_id ?? "");
  }, [shift]);

  const save = () => {
    if (!shift || !inTime) return;
    const clockedIn = timeOnDayToIso(day, inTime);
    const clockedOut = outTime ? timeOnDayToIso(day, outTime) : null;
    if (clockedOut && new Date(clockedOut) <= new Date(clockedIn)) {
      toast({ title: "Uttiden måste vara efter intiden", variant: "destructive" });
      return;
    }

    update.mutate(
      {
        shiftId: shift.id,
        original: {
          clocked_in_at: shift.clocked_in_at,
          clocked_out_at: shift.clocked_out_at,
          store_id: shift.store_id ?? null,
        },
        clocked_in_at: clockedIn,
        clocked_out_at: clockedOut,
        store_id: storeId || null,
        editorName: staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || "Administratör" : "Administratör",
        storeLabels: Object.fromEntries(stores.map((s) => [s.id, s.name])),
      },
      {
        onSuccess: (res) => {
          toast({
            title: res.changed ? "Stämpling rättad" : "Inget ändrat",
            description: res.changed ? `${staffName} — ändringen är loggad.` : undefined,
          });
          onOpenChange(false);
        },
        onError: (err: any) => toast({ title: "Kunde inte spara", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Rätta stämpling — {staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Instämplad</Label>
              <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Utstämplad</Label>
              <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="h-8 text-xs" />
              <p className="text-[10px] text-muted-foreground">Lämna tomt om passet fortfarande pågår.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Enhet</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Välj enhet..." />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Ändringen sparas på befintlig stämpling och loggas med ditt namn, tidpunkt och ursprungligt värde.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending || !inTime}>
            Spara ändring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
