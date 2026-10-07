/**
 * "Registrera frånvaro" — adminnivå registrerar frånvaro åt en anställd.
 * Det som sparas blir godkänt direkt i databasen (admin_register_absence),
 * med samma följder som ett chefsbeslut. Samma dialog ändrar och tar bort.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { IndustryButton, IndustryInput, IndustryRow, StatusLabel } from "@/components/industry";
import { useEmployees } from "@/hooks/useEmployees";
import {
  useAbsenceTypes,
  useAdminCancelAbsence,
  useAdminEndSickAbsence,
  useAdminRegisterAbsence,
  useAdminUpdateAbsence,
  type AbsenceRequest,
} from "@/hooks/useAbsence";
import { dateKey } from "@/lib/schedule";

const QUICK = [
  { label: "Semester", match: ["semester"] },
  { label: "Sjuk", match: ["sjuk"] },
  { label: "VAB", match: ["vab"] },
  { label: "Komp", match: ["komp"] },
];

const svDate = (d: string) =>
  new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));

type ConflictAction = "keep" | "open_shift" | "cancel_shift";

export function RegisterAbsenceDialog({
  open,
  onOpenChange,
  employeeId,
  date,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string | null;
  date?: string | null;
  /** Befintlig frånvaro — dialogen öppnas då för ändring. */
  request?: AbsenceRequest | null;
}) {
  const { data: employees = [] } = useEmployees(false);
  const { data: types = [] } = useAbsenceTypes();
  const register = useAdminRegisterAbsence();
  const update = useAdminUpdateAbsence();
  const cancel = useAdminCancelAbsence();
  const endSick = useAdminEndSickAbsence();

  const [personId, setPersonId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [extent, setExtent] = useState("100");
  const [note, setNote] = useState("");
  const [conflictAction, setConflictAction] = useState<ConflictAction>("keep");
  const [pickOpen, setPickOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setConflictAction("keep");
    if (request) {
      setPersonId(request.employee_id);
      setTypeId(request.absence_type_id);
      setFrom(request.start_date);
      setTo(request.end_date && request.end_date !== request.start_date ? request.end_date : "");
      setExtent(String(request.extent_pct));
      setNote(request.note ?? "");
    } else {
      setPersonId(employeeId ?? "");
      setTypeId("");
      setFrom(date ?? dateKey(new Date()));
      setTo("");
      setExtent("100");
      setNote("");
    }
  }, [open, request, employeeId, date]);

  const quickTypes = useMemo(
    () =>
      QUICK.map((q) => ({
        label: q.label,
        type: types.find((t) => q.match.some((m) => t.name.toLowerCase().startsWith(m) || t.code.toLowerCase() === m)),
      })).filter((q) => q.type),
    [types],
  );
  const otherTypes = types.filter((t) => !quickTypes.some((q) => q.type?.id === t.id));
  const type = types.find((t) => t.id === typeId);
  const person = employees.find((e) => e.id === personId);
  const personName = person ? `${person.first_name} ${person.last_name}` : "";
  const isEdit = Boolean(request);
  const endForSave = to || (type?.is_sick ? null : from);

  const conflicts = useQuery({
    queryKey: ["absence-dialog-conflicts", personId, from, endForSave],
    enabled: open && !isEdit && Boolean(personId && from),
    queryFn: async () => {
      let q = supabase
        .from("shifts")
        .select("id, date, start_time, end_time, store_id")
        .eq("employee_id", personId)
        .eq("status", "published")
        .gte("date", from)
        .order("date");
      q = endForSave ? q.lte("date", endForSave) : q.lte("date", from);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const extentNum = Number(extent.replace(",", "."));
  const valid = personId && typeId && from && (!to || to >= from) && extentNum > 0 && extentNum <= 100;
  const busy = register.isPending || update.isPending || cancel.isPending || endSick.isPending;

  const save = async () => {
    if (!valid) return;
    try {
      if (request) {
        await update.mutateAsync({ id: request.id, startDate: from, endDate: endForSave, extentPct: extentNum, note });
        toast.success("Frånvaron ändrad");
      } else {
        await register.mutateAsync({
          employeeId: personId,
          typeId,
          startDate: from,
          endDate: endForSave,
          extentPct: extentNum,
          note,
          conflictAction,
        });
        toast.success(`${type?.name ?? "Frånvaro"} registrerad för ${personName}`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara frånvaron");
    }
  };

  const remove = async () => {
    if (!request) return;
    try {
      await cancel.mutateAsync({ id: request.id });
      toast.success("Frånvaron borttagen");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ta bort frånvaron");
    }
  };

  const markHealthy = async () => {
    if (!request) return;
    try {
      await endSick.mutateAsync({ id: request.id, lastDay: dateKey(new Date()) });
      toast.success("Friskanmäld");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte friskanmäla");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ind max-w-lg">
        <DialogHeader>
          <DialogTitle className="ind-h2">{isEdit ? "Ändra frånvaro" : "Registrera frånvaro"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Person</Label>
            {isEdit ? (
              <p className="ind-strong">{personName || "Okänd"}</p>
            ) : (
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="ind-btn ind-btn--secondary h-10 w-full justify-between">
                    <span className="truncate">{personName || "Välj person"}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Sök anställd…" />
                    <CommandList>
                      <CommandEmpty>Ingen träff.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={`${e.first_name} ${e.last_name}`}
                            onSelect={() => {
                              setPersonId(e.id);
                              setPickOpen(false);
                            }}
                          >
                            {e.id === personId && <Check className="mr-2 h-4 w-4" />}
                            {e.first_name} {e.last_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-1">
            <Label>Typ</Label>
            {isEdit ? (
              <p className="ind-strong">{type?.name ?? "Frånvaro"}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickTypes.map((q) => (
                  <IndustryButton
                    key={q.label}
                    variant={typeId === q.type!.id ? "primary" : "secondary"}
                    className="h-9"
                    onClick={() => setTypeId(q.type!.id)}
                  >
                    {q.label}
                  </IndustryButton>
                ))}
                {otherTypes.length > 0 && (
                  <Select
                    value={otherTypes.some((t) => t.id === typeId) ? typeId : ""}
                    onValueChange={setTypeId}
                  >
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue placeholder="Annat" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Från</Label>
              <IndustryInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Till</Label>
              <IndustryInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              <p className="ind-muted text-xs">{type?.is_sick ? "Tomt = pågående" : "Tomt = en dag"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Omfattning (%)</Label>
              <IndustryInput inputMode="numeric" value={extent} onChange={(e) => setExtent(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kommentar</Label>
              <IndustryInput value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {!isEdit && (conflicts.data?.length ?? 0) > 0 && (
            <IndustryRow edge="alert" className="block space-y-2">
              <p className="ind-strong text-sm">Publicerade pass under perioden</p>
              <ul className="ind-muted space-y-0.5 font-mono text-xs tabular-nums">
                {conflicts.data!.map((s) => (
                  <li key={s.id}>
                    {svDate(s.date)} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  </li>
                ))}
              </ul>
              <Select value={conflictAction} onValueChange={(v) => setConflictAction(v as ConflictAction)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Behåll passen</SelectItem>
                  <SelectItem value="open_shift">Öppna passen för anmälan</SelectItem>
                  <SelectItem value="cancel_shift">Avboka passen</SelectItem>
                </SelectContent>
              </Select>
            </IndustryRow>
          )}

          {isEdit && type?.is_sick && !request?.end_date && (
            <IndustryRow edge="accent" className="flex flex-wrap items-center justify-between gap-2">
              <StatusLabel tone="progress">Pågående sjukperiod</StatusLabel>
              <IndustryButton className="h-9" disabled={busy} onClick={markHealthy}>
                Friskanmäl i dag
              </IndustryButton>
            </IndustryRow>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {isEdit &&
            (confirmDelete ? (
              <IndustryButton variant="ghost" disabled={busy} onClick={remove}>
                Bekräfta borttagning
              </IndustryButton>
            ) : (
              <IndustryButton variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Ta bort
              </IndustryButton>
            ))}
          <IndustryButton variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </IndustryButton>
          <IndustryButton variant="primary" disabled={!valid || busy} onClick={save}>
            {isEdit ? "Spara ändringar" : "Registrera"}
          </IndustryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
