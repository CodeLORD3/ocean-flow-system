import { useState } from "react";
import { LogIn, LogOut, Clock } from "lucide-react";
import { useStaff } from "@/hooks/useStaff";
import { useOpenShifts, useMyOpenShift, useClockIn, useClockOut, shiftClock, shiftDuration } from "@/hooks/useStaffShifts";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Live-lista över personal som är instämplad just nu + stämpelknapp för den inloggade.
 * Visas i Översikt — till höger om rubriken på dator, under rubriken på mobil.
 */
export function OnDutyStaff({ storeId }: { storeId?: string | null }) {
  // Hämta all personal — en person kan vara instämplad på en annan butik än sin hemmabutik
  const { data: staffList = [] } = useStaff();
  const { data: openShifts = [] } = useOpenShifts(storeId ?? undefined);
  const { staff } = useStaffAuth();
  const { data: stores = [] } = useStores(true);
  const { data: myShift } = useMyOpenShift(staff?.id);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | "in" | "out">(null);

  const byId = new Map(staffList.map((s: any) => [s.id, s]));
  const onDuty = openShifts
    .map((sh) => ({ shift: sh, person: byId.get(sh.staff_id) as any }))
    .filter((x) => !!x.person);

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";
  const myStoreName = stores.find((s) => s.id === myShift?.store_id)?.name ?? "";
  const now = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const fullName = staff ? `${staff.first_name} ${staff.last_name}` : "";

  const handleConfirm = () => {
    if (!staff) return;
    if (confirm === "in") {
      clockIn.mutate(
        { staffId: staff.id, storeId: storeId ?? null },
        {
          onSuccess: (res) => {
            if (res.outcome === "already") {
              toast({
                title: "Redan instämplad",
                description: `${fullName} är redan instämplad${storeName ? ` i ${storeName}` : ""}.`,
              });
            } else if (res.outcome === "moved") {
              const from = stores.find((s) => s.id === res.previousStoreId)?.name;
              toast({
                title: "Stämpling flyttad",
                description: `${fullName} stämplades ut från ${from ?? "tidigare arbetsplats"} och in${storeName ? ` i ${storeName}` : ""}.`,
              });
            } else {
              toast({ title: "Instämplad", description: `${fullName}${storeName ? ` · ${storeName}` : ""}` });
            }
          },
          onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
        },
      );
    } else if (confirm === "out") {
      clockOut.mutate(
        { staffId: staff.id },
        {
          onSuccess: () => toast({ title: "Utstämplad", description: myShift ? shiftDuration(myShift.clocked_in_at) : undefined }),
          onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
        },
      );
    }
    setConfirm(null);
  };

  return (
    <div className="flex items-stretch gap-2 sm:justify-end">
      {/* Stämpelklockan — till vänster om kortet */}
      {staff && (
        <div className="flex shrink-0 items-stretch">
          {myShift ? (
            <Button
              variant="outline"
              className="h-auto gap-1.5 border-destructive/40 px-3 py-1.5 text-xs font-semibold"
              onClick={() => setConfirm("out")}
              disabled={clockOut.isPending}
            >
              <LogOut className="h-3.5 w-3.5" /> Stämpla ut
            </Button>
          ) : (
            <Button
              className="h-auto gap-1.5 px-3 py-1.5 text-xs font-semibold"
              onClick={() => setConfirm("in")}
              disabled={clockIn.isPending || !storeId}
            >
              <LogIn className="h-3.5 w-3.5" /> Stämpla in
            </Button>
          )}
        </div>
      )}

      {/* "Arbetar nu"-kortet */}
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-card sm:flex-none">

        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {onDuty.length > 0 && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              onDuty.length > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"
            }`}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-tight text-foreground">
            {onDuty.length > 0 ? `Arbetar nu · ${onDuty.length}` : "Ingen instämplad"}
          </p>
          {onDuty.length === 0 ? (
            <p className="text-[11px] leading-tight text-muted-foreground">Stämpla in med knappen här</p>
          ) : (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {onDuty.map(({ shift, person }) => (
                <span
                  key={shift.id}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] leading-none text-foreground"
                >
                  {person.profile_image_url ? (
                    <img
                      src={person.profile_image_url}
                      alt={`${person.first_name} ${person.last_name}`}
                      className="h-3.5 w-3.5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                  <span className="font-medium">
                    {person.first_name} {person.last_name?.charAt(0)}.
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {shiftClock(shift.clocked_in_at)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>



      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {confirm === "out" ? "Bekräfta utstämpling" : "Bekräfta instämpling"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="text-foreground font-medium">{fullName}</p>
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 text-xs">
                  <p className="flex justify-between">
                    <span className="text-muted-foreground">Tid</span>
                    <span className="font-semibold tabular-nums text-foreground">{now}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-muted-foreground">Arbetsplats</span>
                    <span className="font-semibold text-foreground">
                      {confirm === "out" ? (myStoreName || "—") : (storeName || "—")}
                    </span>
                  </p>
                  {confirm === "out" && myShift && (
                    <p className="flex justify-between">
                      <span className="text-muted-foreground">Arbetad tid</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {shiftDuration(myShift.clocked_in_at)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {confirm === "out" ? "Stämpla ut" : "Stämpla in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
