import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useStaff } from "@/hooks/useStaff";
import { useSaveMapPin, type MapPin } from "@/hooks/useStoreMap";

export const PIN_KINDS = [
  { key: "note", label: "Anteckning" },
  { key: "photo", label: "Ta en bild" },
  { key: "clean", label: "Städa" },
  { key: "measure", label: "Mät ytan" },
  { key: "check", label: "Kontrollera" },
  { key: "fix", label: "Åtgärda" },
] as const;

export const PIN_KIND_LABEL: Record<string, string> = Object.fromEntries(
  PIN_KINDS.map((k) => [k.key, k.label]),
);

/** Ny eller ändrad punkt: anteckning, eller uppgift lagd på en person. */
export function MapPinDialog({
  open,
  onOpenChange,
  storeId,
  planId,
  point,
  zoneId,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  planId: string;
  point: { x: number; y: number } | null;
  zoneId?: string | null;
  existing?: MapPin | null;
}) {
  const { data: staff = [] } = useStaff(storeId);
  const save = useSaveMapPin();
  const [kind, setKind] = useState("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("none");
  const [due, setDue] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(existing?.kind ?? "note");
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    setAssignee(existing?.assigned_staff_id ?? "none");
    setDue(existing?.due_date ?? "");
  }, [open, existing]);

  const submit = async () => {
    const person = staff.find((s) => s.id === assignee);
    try {
      await save.mutateAsync({
        id: existing?.id,
        floor_plan_id: planId,
        store_id: storeId,
        zone_id: existing?.zone_id ?? zoneId ?? null,
        x: existing?.x ?? point?.x ?? 0,
        y: existing?.y ?? point?.y ?? 0,
        kind,
        title: title.trim() || PIN_KIND_LABEL[kind],
        body: body.trim() || null,
        assigned_staff_id: person ? person.id : null,
        assigned_name: person ? `${person.first_name} ${person.last_name}` : null,
        due_date: due || null,
      });
      toast({ title: person ? `Uppgiften ligger på ${person.first_name}` : "Punkten är sparad" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Kunde inte spara", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{existing ? "Ändra punkt" : "Ny punkt på kartan"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Vad ska göras</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIN_KINDS.map((k) => (
                  <SelectItem key={k.key} value={k.key} className="text-xs">
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Rubrik</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={PIN_KIND_LABEL[kind]}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Beskrivning</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Vad gäller det på just den här platsen?"
              className="min-h-[64px] text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Ansvarig</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">Ingen särskild</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.first_name} {s.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Senast klart</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" className="h-8 text-[11px]" onClick={submit} disabled={save.isPending}>
            Spara punkt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
