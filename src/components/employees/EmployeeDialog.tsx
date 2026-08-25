import { useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, AlertTriangle, Link2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Employee, Employment, EMPLOYMENT_FORMS, AGREEMENT_AREAS,
  employeeName, lasWarnings, useEmployments, useSaveEmployee, useDeleteEmployment,
  usePkStaffCandidates, useLinkPkStaff,
} from "@/hooks/useEmployees";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import { isValidPnr, maskPnr } from "@/lib/personnummer";
import { EmploymentForm } from "./EmploymentForm";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface Props {
  open: boolean;
  employee: Employee | null;
  onOpenChange: (v: boolean) => void;
}

/** Personkortet: personuppgifter, anställningar som tidslinje och dokumentarkiv. */
export function EmployeeDialog({ open, employee, onOpenChange }: Props) {
  const { toast } = useToast();
  const save = useSaveEmployee();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const employeeId = employee?.id ?? createdId;
  const { data: employments = [] } = useEmployments(employeeId ?? undefined);
  const deleteEmployment = useDeleteEmployment();

  const [f, setF] = useState({
    first_name: employee?.first_name ?? "",
    last_name: employee?.last_name ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    pnr: "",
    alt_clock_identifier: employee?.alt_clock_identifier ?? "",
    address_street: employee?.address_street ?? "",
    postal_code: employee?.postal_code ?? "",
    city: employee?.city ?? "",
    country: employee?.country ?? "SE",
    birth_date: employee?.birth_date ?? "",
    emergency_contact_name: employee?.emergency_contact_name ?? "",
    emergency_contact_phone: employee?.emergency_contact_phone ?? "",
    emergency_contact_relation: employee?.emergency_contact_relation ?? "",
    notes: employee?.notes ?? "",
    is_active: employee?.is_active ?? true,
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const [showEmploymentForm, setShowEmploymentForm] = useState(false);
  const [editEmployment, setEditEmployment] = useState<Employment | null>(null);

  const pnrOk = f.pnr.trim() === "" || isValidPnr(f.pnr);

  const submitPerson = async () => {
    if (!f.first_name.trim() || !f.last_name.trim()) {
      toast({ title: "Förnamn och efternamn krävs", variant: "destructive" });
      return;
    }
    if (!pnrOk) {
      toast({ title: "Personnummret ser inte korrekt ut", description: "Tio siffror, kontrollsiffran stämmer inte.", variant: "destructive" });
      return;
    }
    try {
      const id = await save.mutateAsync({
        id: employeeId ?? undefined,
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        email: f.email || null,
        phone: f.phone || null,
        pnr: f.pnr || undefined,
        alt_clock_identifier: f.alt_clock_identifier || null,
        address_street: f.address_street || null,
        postal_code: f.postal_code || null,
        city: f.city || null,
        country: f.country || null,
        birth_date: f.birth_date || null,
        emergency_contact_name: f.emergency_contact_name || null,
        emergency_contact_phone: f.emergency_contact_phone || null,
        emergency_contact_relation: f.emergency_contact_relation || null,
        notes: f.notes || null,
        is_active: f.is_active,
      });
      setCreatedId(id);
      setF((p) => ({ ...p, pnr: "" }));
      toast({ title: "Personuppgifterna är sparade" });
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  const savedPnr = employee?.pnr_masked;

  // Personalkollen-status: kopplat kort, samt förslag när koppling saknas.
  const { data: pkStaff = [] } = usePkStaffCandidates();
  const linkPk = useLinkPkStaff();
  const linkedPk = pkStaff.find((p) => p.employee_id === employeeId || p.id === employee?.pk_staff_id) ?? null;
  const pkMatchSource = linkedPk
    ? linkedPk.email && employee?.email && linkedPk.email.toLowerCase() === employee.email.toLowerCase()
      ? "e-post"
      : "manuell"
    : null;
  const pkSuggestions = pkStaff.filter(
    (p) =>
      !p.employee_id &&
      ((p.email && employee?.email && p.email.toLowerCase() === employee.email.toLowerCase()) ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase() ===
          `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim().toLowerCase()),
  );

  const { data: entities = [] } = useLegalEntities();
  const entityName = (id: string | null) =>
    (id && (entities as any[]).find((e) => e.legal_entity_id === id)?.legal_name) || id || null;

  const pkRow = employeeId ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <Link2 className="h-4 w-4 text-muted-foreground" />
      {linkedPk ? (
        <>
          <span>
            Kopplad till Personalkollen:{" "}
            <span className="font-medium">
              {[linkedPk.first_name, linkedPk.last_name].filter(Boolean).join(" ") || "okänt namn"}
            </span>
            {linkedPk.employment_number && (
              <span className="font-mono text-muted-foreground"> · {linkedPk.employment_number}</span>
            )}
          </span>
          <Badge variant="outline">Matchning: {pkMatchSource}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => linkPk.mutate({ employeeId, pkStaffId: null })}
            disabled={linkPk.isPending}
          >
            Koppla bort
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Ej kopplad till Personalkollen</span>
          <div className="min-w-[220px]">
            <Select onValueChange={(v) => linkPk.mutate({ employeeId, pkStaffId: v })}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={pkSuggestions.length ? "Förslag finns – välj kort" : "Välj kort att koppla"} />
              </SelectTrigger>
              <SelectContent>
                {[...pkSuggestions, ...pkStaff.filter((p) => !p.employee_id && !pkSuggestions.includes(p))].map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id.slice(0, 8)}
                    {p.employment_number ? ` · ${p.employment_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  ) : null;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? employeeName(employee) : "Ny person"}</DialogTitle>
          <DialogDescription>
            Personalregistret är master. Personnummer lagras aldrig i klartext.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="person">
          <TabsList>
            <TabsTrigger value="person">Personuppgifter</TabsTrigger>
            <TabsTrigger value="employments" disabled={!employeeId}>Anställningar</TabsTrigger>
            <TabsTrigger value="docs" disabled={!employeeId}>Dokument</TabsTrigger>
          </TabsList>

          <TabsContent value="person" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Förnamn</Label>
                <Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </div>
              <div>
                <Label>Efternamn</Label>
                <Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </div>
              <div>
                <Label>E-post</Label>
                <Input type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label>Personnummer (10 siffror)</Label>
                <Input
                  value={f.pnr}
                  onChange={(e) => set("pnr", e.target.value)}
                  inputMode="numeric"
                  placeholder={savedPnr ? `Sparat: ${savedPnr}` : "ÅÅMMDD-XXXX"}
                  className="font-mono tabular-nums"
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  {f.pnr && !pnrOk
                    ? "Kontrollsiffran stämmer inte"
                    : f.pnr
                      ? `Sparas maskerat som ${maskPnr(f.pnr) || "…"}`
                      : "Används endast som uppslagsnyckel i stämpelklockan"}
                </p>
              </div>
              <div>
                <Label>Bricka/PIN för klockan (valfritt)</Label>
                <Input value={f.alt_clock_identifier} onChange={(e) => set("alt_clock_identifier", e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Födelsedatum</Label>
                <Input type="date" value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
              </div>
              <div>
                <Label>Adress</Label>
                <Input value={f.address_street} onChange={(e) => set("address_street", e.target.value)} />
              </div>
              <div>
                <Label>Postnummer</Label>
                <Input value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <Label>Ort</Label>
                <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <Label>Närmast anhörig</Label>
                <Input value={f.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
              </div>
              <div>
                <Label>Anhörigs telefon</Label>
                <Input inputMode="tel" value={f.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
              </div>
              <div>
                <Label>Relation</Label>
                <Input value={f.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} />
              </div>
              <div>
                <Label>Anteckning</Label>
                <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
              Aktiv i registret
            </label>
            <div className="flex justify-end">
              <Button onClick={submitPerson} disabled={save.isPending}>Spara personuppgifter</Button>
            </div>
          </TabsContent>

          <TabsContent value="employments" className="space-y-4 pt-4">
            {showEmploymentForm || editEmployment ? (
              <EmploymentForm
                employeeId={employeeId!}
                employment={editEmployment}
                onDone={() => { setShowEmploymentForm(false); setEditEmployment(null); }}
              />
            ) : (
              <>
                <Button size="sm" onClick={() => setShowEmploymentForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Ny anställning
                </Button>
                {employments.length === 0 && (
                  <p className="text-sm text-muted-foreground">Inga anställningar registrerade.</p>
                )}
                <div className="space-y-2">
                  {employments.map((em) => {
                    const warnings = lasWarnings(em);
                    return (
                      <div key={em.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {em.job_title || "Anställning"}
                              {em.legal_entity_id && <span className="text-muted-foreground"> · {entityName(em.legal_entity_id)}</span>}
                            </p>
                            <p className="font-mono text-xs tabular-nums text-muted-foreground">
                              {em.start_date || "–"} → {em.end_date || "löpande"} · {em.employment_rate} %
                              {em.pay_type === "monthly"
                                ? em.monthly_salary != null && ` · ${em.monthly_salary.toLocaleString("sv-SE")} kr/mån`
                                : em.hourly_rate != null && ` · ${em.hourly_rate.toLocaleString("sv-SE")} kr/tim`}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge variant="secondary">{EMPLOYMENT_FORMS.find((o) => o.value === em.form)?.label ?? em.form}</Badge>
                              <Badge variant="outline">{AGREEMENT_AREAS.find((o) => o.value === em.agreement_area)?.label ?? em.agreement_area}</Badge>
                              {em.employment_number && <Badge variant="outline" className="font-mono">Anst.nr {em.employment_number}</Badge>}
                              {em.pension_lf && <Badge variant="outline">LF-pension</Badge>}
                              {!em.is_active && <Badge variant="outline">Avslutad</Badge>}
                            </div>
                            {warnings.map((w) => (
                              <p key={w} className="mt-1 flex items-center gap-1 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3" /> {w}
                              </p>
                            ))}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => setEditEmployment(em)} aria-label="Redigera">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteEmployment.mutate(em.id)} aria-label="Ta bort">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="docs" className="pt-4">
            {employeeId && <EmployeeDocuments employeeId={employeeId} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
