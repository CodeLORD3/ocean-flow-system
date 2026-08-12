import { useEffect, useState } from "react";
import { Wallet, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSalaryHistory, useSaveSalary, type EmploymentType } from "@/hooks/useSalaryHistory";
import { MONTHLY_HOURS } from "@/lib/staffKpi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: { id: string; first_name?: string | null; last_name?: string | null; employment_type?: string | null; hourly_rate?: number | null; monthly_salary?: number | null } | null;
}

/**
 * Snabbredigering av lön direkt från schemat, så kostnaden per dag och vecka
 * kan räknas fram utan att gå via personalsidan. Sparas som lönehistorik med
 * giltig-från-datum — äldre veckor behåller den lön som gällde då.
 */
export function StaffSalaryDialog({ open, onOpenChange, staff }: Props) {
  const { toast } = useToast();
  const save = useSaveSalary();
  const history = useSalaryHistory(open ? staff?.id : null);

  const [type, setType] = useState<EmploymentType>("hourly");
  const [hourly, setHourly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!staff || !open) return;
    setType((staff.employment_type as EmploymentType) ?? "hourly");
    setHourly(staff.hourly_rate != null ? String(staff.hourly_rate) : "");
    setMonthly(staff.monthly_salary != null ? String(staff.monthly_salary) : "");
    setValidFrom(new Date().toISOString().slice(0, 10));
  }, [staff, open]);

  const submit = async () => {
    if (!staff) return;
    const h = hourly ? Number(hourly) : null;
    const m = monthly ? Number(monthly) : null;
    if (type === "hourly" ? !h : !m) {
      toast({ title: "Fyll i lönen först", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({
        staff_id: staff.id,
        employment_type: type,
        hourly_rate: type === "hourly" ? h : null,
        monthly_salary: type === "monthly" ? m : null,
        valid_from: validFrom,
      });
      toast({ title: "Lönen sparad" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Lönen kunde inte sparas", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Lön — {staff?.first_name} {staff?.last_name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Timlön eller månadslön. Månadslön slås ut på {MONTHLY_HOURS} timmar/månad när kostnaden per pass räknas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Anställningstyp</Label>
            <Select value={type} onValueChange={(v) => setType(v as EmploymentType)}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly" className="text-xs">Timanställd</SelectItem>
                <SelectItem value="monthly" className="text-xs">Månadsanställd</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "hourly" ? (
            <div>
              <Label className="text-xs">Timlön (kr/h)</Label>
              <Input className="mt-1 h-8 text-xs tabular-nums" inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Månadslön (kr)</Label>
              <Input className="mt-1 h-8 text-xs tabular-nums" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
          )}

          <div>
            <Label className="text-xs">Lön gäller från</Label>
            <Input type="date" className="mt-1 h-8 text-xs" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Sparas som lönehistorik — äldre perioder räknas med tidigare lön.
            </p>
          </div>

          {(history.data ?? []).length > 0 && (
            <div className="rounded border border-border p-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lönehistorik</p>
              <ul className="space-y-0.5">
                {(history.data ?? []).map((row) => (
                  <li key={row.id} className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
                    <span>{row.valid_from}</span>
                    <span>
                      {row.employment_type === "monthly"
                        ? `${Number(row.monthly_salary ?? 0).toLocaleString("sv-SE")} kr/mån`
                        : `${Number(row.hourly_rate ?? 0).toLocaleString("sv-SE")} kr/h`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={submit} disabled={save.isPending}>
            <Save className="h-3.5 w-3.5" /> Spara lön
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
