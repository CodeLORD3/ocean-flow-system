import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStores } from "@/hooks/useStores";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import {
  Employment, EMPLOYMENT_FORMS, AGREEMENT_AREAS, CONVERTING_FORMS,
  conversionDateFor, useSaveEmployment, useEmployments,
} from "@/hooks/useEmployees";

interface Props {
  employeeId: string;
  employment?: Employment | null;
  onDone: () => void;
}

/** Formulär för en anställning: LAS-fält, lön, skatt, semester, pension, avtalsområde. */
export function EmploymentForm({ employeeId, employment, onDone }: Props) {
  const { toast } = useToast();
  const { data: stores = [] } = useStores();
  const { data: entities = [] } = useLegalEntities();
  const save = useSaveEmployment();

  const [f, setF] = useState({
    legal_entity_id: employment?.legal_entity_id ?? "",
    store_id: employment?.store_id ?? "",
    employment_number: employment?.employment_number ?? "",
    job_title: employment?.job_title ?? "",
    form: employment?.form ?? "tillsvidare",
    start_date: employment?.start_date ?? "",
    end_date: employment?.end_date ?? "",
    probation_end_date: employment?.probation_end_date ?? "",
    conversion_date: employment?.conversion_date ?? "",
    employment_rate: String(employment?.employment_rate ?? 100),
    pay_type: employment?.pay_type ?? "monthly",
    monthly_salary: employment?.monthly_salary != null ? String(employment.monthly_salary) : "",
    hourly_rate: employment?.hourly_rate != null ? String(employment.hourly_rate) : "",
    cost_center: employment?.cost_center ?? "",
    tax_table: employment?.tax_table != null ? String(employment.tax_table) : "",
    tax_column: employment?.tax_column != null ? String(employment.tax_column) : "",
    tax_adjustment: employment?.tax_adjustment != null ? String(employment.tax_adjustment) : "",
    vacation_rule: employment?.vacation_rule ?? "sammalon",
    vacation_days: String(employment?.vacation_days ?? 25),
    vacation_supplement_pct: String(employment?.vacation_supplement_pct ?? 0.43),
    pension_lf: employment?.pension_lf ?? true,
    agreement_area: employment?.agreement_area ?? "butik",
    is_active: employment?.is_active ?? true,
    notes: employment?.notes ?? "",
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  // Tidigare visstidsrader hos personen minskar tiden kvar till konvertering.
  const { data: allEmployments = [] } = useEmployments(employeeId);
  const earlier = allEmployments.filter((em) => em.id !== employment?.id);
  const autoConversion = conversionDateFor(f.start_date, f.form, earlier);

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));


  const submit = async () => {
    try {
      await save.mutateAsync({
        id: employment?.id,
        employee_id: employeeId,
        legal_entity_id: f.legal_entity_id || null,
        store_id: f.store_id || null,
        employment_number: f.employment_number || null,
        fortnox_employee_id: f.employment_number || null,
        job_title: f.job_title || null,
        form: f.form,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
        probation_end_date: f.probation_end_date || null,
        conversion_date: f.conversion_date || autoConversion,
        employment_rate: Number(f.employment_rate || 100),
        pay_type: f.pay_type,
        monthly_salary: num(f.monthly_salary),
        hourly_rate: num(f.hourly_rate),
        cost_center: f.cost_center || null,
        tax_table: num(f.tax_table),
        tax_column: num(f.tax_column),
        tax_adjustment: num(f.tax_adjustment),
        vacation_rule: f.vacation_rule,
        vacation_days: Number(f.vacation_days || 25),
        vacation_supplement_pct: Number(f.vacation_supplement_pct || 0.43),
        pension_lf: f.pension_lf,
        agreement_area: f.agreement_area,
        is_active: f.is_active,
        notes: f.notes || null,
      } as Partial<Employment>);
      toast({ title: employment ? "Anställningen uppdaterad" : "Anställningen skapad" });
      onDone();
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Bolag</Label>
          <Select value={f.legal_entity_id} onValueChange={(v) => set("legal_entity_id", v)}>
            <SelectTrigger><SelectValue placeholder="Välj bolag" /></SelectTrigger>
            <SelectContent>
              {entities.map((e: any) => (
                <SelectItem key={e.legal_entity_id} value={e.legal_entity_id}>{e.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Enhet</Label>
          <Select value={f.store_id} onValueChange={(v) => set("store_id", v)}>
            <SelectTrigger><SelectValue placeholder="Välj enhet" /></SelectTrigger>
            <SelectContent>
              {stores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Anställningsnummer (Fortnox)</Label>
          <Input value={f.employment_number} onChange={(e) => set("employment_number", e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <Label>Befattning</Label>
          <Input value={f.job_title} onChange={(e) => set("job_title", e.target.value)} />
        </div>
        <div>
          <Label>Anställningsform</Label>
          <Select value={f.form} onValueChange={(v) => set("form", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_FORMS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Avtalsområde</Label>
          <Select value={f.agreement_area} onValueChange={(v) => set("agreement_area", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AGREEMENT_AREAS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Startdatum</Label>
          <Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </div>
        <div>
          <Label>Slutdatum</Label>
          <Input type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </div>
        {f.form === "prov" && (
          <div>
            <Label>Provanställning t.o.m.</Label>
            <Input type="date" value={f.probation_end_date} onChange={(e) => set("probation_end_date", e.target.value)} />
          </div>
        )}
        {CONVERTING_FORMS.includes(f.form) && (
          <div>
            <Label>Konverteringsdatum (LAS)</Label>
            <Input type="date" value={f.conversion_date} onChange={(e) => set("conversion_date", e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {autoConversion
                ? `Beräknas automatiskt till ${autoConversion} (12 mån visstid inom femårsperiod). Går att justera.`
                : "Fylls i automatiskt när startdatum är satt."}
            </p>
          </div>
        )}

        <div>
          <Label>Sysselsättningsgrad (%)</Label>
          <Input value={f.employment_rate} onChange={(e) => set("employment_rate", e.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
        </div>
        <div>
          <Label>Löneform</Label>
          <Select value={f.pay_type} onValueChange={(v) => set("pay_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Månadslön</SelectItem>
              <SelectItem value="hourly">Timlön</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {f.pay_type === "monthly" ? (
          <div>
            <Label>Månadslön</Label>
            <Input value={f.monthly_salary} onChange={(e) => set("monthly_salary", e.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
          </div>
        ) : (
          <div>
            <Label>Timlön</Label>
            <Input value={f.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
          </div>
        )}
        <div>
          <Label>Kostnadsställe</Label>
          <Input value={f.cost_center} onChange={(e) => set("cost_center", e.target.value)} />
        </div>
        <div>
          <Label>Skattetabell</Label>
          <Input value={f.tax_table} onChange={(e) => set("tax_table", e.target.value)} inputMode="numeric" className="font-mono tabular-nums" />
        </div>
        <div>
          <Label>Skattekolumn</Label>
          <Input value={f.tax_column} onChange={(e) => set("tax_column", e.target.value)} inputMode="numeric" className="font-mono tabular-nums" />
        </div>
        <div>
          <Label>Jämkning (%)</Label>
          <Input value={f.tax_adjustment} onChange={(e) => set("tax_adjustment", e.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
        </div>
        <div>
          <Label>Semesterregel</Label>
          <Select value={f.vacation_rule} onValueChange={(v) => set("vacation_rule", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sammalon">Sammalöneregeln</SelectItem>
              <SelectItem value="procent">Procentregeln</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Semesterdagar</Label>
          <Input value={f.vacation_days} onChange={(e) => set("vacation_days", e.target.value)} inputMode="numeric" className="font-mono tabular-nums" />
        </div>
        <div>
          <Label>Semestertillägg (%)</Label>
          <Input value={f.vacation_supplement_pct} onChange={(e) => set("vacation_supplement_pct", e.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
          <p className="mt-1 text-xs text-muted-foreground">0,43 % är lagstadgat. 0,8 % är Handels-nivå och ett aktivt policyval.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.pension_lf} onCheckedChange={(v) => set("pension_lf", v)} />
          Tjänstepension via Länsförsäkringar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
          Aktiv anställning
        </label>
      </div>

      <div>
        <Label>Anteckning</Label>
        <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Avbryt</Button>
        <Button onClick={submit} disabled={save.isPending}>Spara anställning</Button>
      </div>
    </div>
  );
}
