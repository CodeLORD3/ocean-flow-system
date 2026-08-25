import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { IdCard, Plus, Search, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import {
  Employee, employeeName, lasWarnings, useEmployees, useAllEmployments,
} from "@/hooks/useEmployees";
import { EmployeeDialog } from "@/components/employees/EmployeeDialog";

/** Personalregistret — master för person och anställning (Personalmodul etapp 1). */
export default function Employees() {
  const { data: employees, isLoading } = useEmployees(true);
  const { data: employments = [] } = useAllEmployments();
  const { data: entities = [] } = useLegalEntities();

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");
  const [status, setStatus] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);

  const byEmployee = useMemo(() => {
    const m = new Map<string, typeof employments>();
    for (const em of employments) {
      const list = m.get(em.employee_id) ?? [];
      list.push(em);
      m.set(em.employee_id, list);
    }
    return m;
  }, [employments]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (employees ?? []).filter((e) => {
      if (status === "active" && !e.is_active) return false;
      if (status === "inactive" && e.is_active) return false;
      const ems = byEmployee.get(e.id) ?? [];
      if (entity !== "all" && !ems.some((em) => em.legal_entity_id === entity)) return false;
      if (!needle) return true;
      const hay = [
        employeeName(e), e.email, e.phone,
        ...ems.map((em) => em.employment_number ?? ""),
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [employees, byEmployee, q, entity, status]);

  const warningCount = useMemo(
    () => employments.reduce((sum, em) => sum + lasWarnings(em).length, 0),
    [employments],
  );

  const openNew = () => { setSelected(null); setDialogOpen(true); };
  const openRow = (e: Employee) => { setSelected(e); setDialogOpen(true); };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <IdCard className="h-6 w-6 text-primary" /> Personalregister
          </h1>
          <p className="text-sm text-muted-foreground">
            Person och anställning per bolag. Personnummer lagras krypterat och visas maskerat.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Ny person
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Personer i registret</p>
          <p className="font-mono text-2xl tabular-nums">{employees?.length ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Aktiva anställningar</p>
          <p className="font-mono text-2xl tabular-nums">{employments.filter((e) => e.is_active).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">LAS-varningar</p>
          <p className={`font-mono text-2xl tabular-nums ${warningCount ? "text-destructive" : ""}`}>{warningCount}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök namn, e-post eller anställningsnummer" className="pl-9" />
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla bolag</SelectItem>
            {entities.map((e: any) => (
              <SelectItem key={e.legal_entity_id} value={e.legal_entity_id}>{e.legal_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Aktiva</SelectItem>
            <SelectItem value="inactive">Avslutade</SelectItem>
            <SelectItem value="all">Alla</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          Inga personer matchar filtret.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((e, i) => {
            const ems = byEmployee.get(e.id) ?? [];
            const active = ems.filter((em) => em.is_active);
            const warnings = ems.flatMap((em) => lasWarnings(em));
            return (
              <motion.button
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.2) }}
                onClick={() => openRow(e)}
                className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{employeeName(e)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[e.email, e.phone].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {e.pnr_masked && (
                      <Badge variant="outline" className="gap-1 font-mono tabular-nums">
                        <ShieldCheck className="h-3 w-3" /> {e.pnr_masked}
                      </Badge>
                    )}
                    {active.map((em) => (
                      <Badge key={em.id} variant="secondary">
                        {em.legal_entity_id ?? "—"}
                        {em.employment_number ? ` · ${em.employment_number}` : ""} · {em.employment_rate} %
                      </Badge>
                    ))}
                    {active.length === 0 && <Badge variant="outline">Ingen aktiv anställning</Badge>}
                    {warnings.length > 0 && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {warnings.length}
                      </Badge>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <EmployeeDialog
          key={selected?.id ?? "new"}
          open={dialogOpen}
          employee={selected}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
