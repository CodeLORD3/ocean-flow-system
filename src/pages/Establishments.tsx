import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import IdentificationMark from "@/components/inventory/IdentificationMark";
import {
  useEstablishments,
  useMarkReceivers,
  useSaveEstablishment,
  useUpdateCustomerMark,
  useUpdateStoreEstablishment,
  type Establishment,
} from "@/hooks/useEstablishments";

const APPROVAL_TYPES = ["FFPP", "PP", "Detaljhandel"];

const emptyForm: Partial<Establishment> = {
  name: "",
  approval_number: "",
  identification_mark: "",
  approval_type: "FFPP",
  control_authority: "",
  registered_at: "",
  valid_to: "",
  active: true,
  note: "",
};

export default function Establishments() {
  const { data: establishments = [], isLoading } = useEstablishments();
  const { data: receivers } = useMarkReceivers();
  const save = useSaveEstablishment();
  const updateStore = useUpdateStoreEstablishment();
  const updateCustomer = useUpdateCustomerMark();

  const [form, setForm] = useState<Partial<Establishment> | null>(null);

  const stores = receivers?.stores ?? [];
  const customers = receivers?.customers ?? [];

  /** Anläggningar som saknar märke men har mottagare som kräver det. */
  const alarms = useMemo(() => {
    const requiring = stores.filter((s) => s.requires_identification_mark && s.establishment_id);
    const out: { establishment: string; store: string }[] = [];
    for (const s of requiring) {
      const est = establishments.find((e) => e.id === s.establishment_id);
      if (est && !est.identification_mark && !est.approval_number) {
        out.push({ establishment: est.name, store: s.name });
      }
    }
    return out;
  }, [stores, establishments]);

  const doSave = async () => {
    if (!form?.name?.trim()) {
      toast.error("Anläggningen behöver ett namn.");
      return;
    }
    try {
      await save.mutateAsync(form);
      toast.success("Anläggningen är sparad.");
      setForm(null);
    } catch (e: any) {
      toast.error(e.message || "Anläggningen kunde inte sparas.");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Anläggningar och identifieringsmärke</h1>
          <p className="text-xs text-muted-foreground">
            Ovalt märke enligt förordning 853/2004. Rekommendation: märk allt som packas i produktionen —
            det är alltid rätt och personalen slipper hålla gränsdragningen i huvudet.
          </p>
        </div>
        <Button size="sm" className="gap-1 text-xs" onClick={() => setForm({ ...emptyForm })}>
          <Plus className="h-3.5 w-3.5" /> Ny anläggning
        </Button>
      </div>

      {alarms.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Anläggning saknar identifieringsmärke</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {alarms.map((a, i) => (
                <li key={i}>
                  {a.establishment} levererar till {a.store}, som kräver märke.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-primary" /> Anläggningar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Hämtar anläggningar…</p>
          ) : establishments.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Inga anläggningar upplagda"
              description="Lägg upp den godkända anläggningen med dess godkännandenummer, så kan märket skrivas ut på etiketter och följesedlar."
            />
          ) : (
            establishments.map((est) => (
              <button
                key={est.id}
                onClick={() => setForm({ ...est, registered_at: est.registered_at ?? "", valid_to: est.valid_to ?? "" })}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-2 text-left hover:bg-accent/40"
              >
                <IdentificationMark markText={est.identification_mark} approvalNumber={est.approval_number} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{est.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[est.approval_type, est.control_authority, est.valid_to ? `Giltig till ${est.valid_to}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                {!est.active && <Badge variant="outline" className="text-[10px]">Inaktiv</Badge>}
                {!est.identification_mark && !est.approval_number && (
                  <Badge variant="destructive" className="text-[10px]">Märke saknas</Badge>
                )}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Butiker som mottagare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {stores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.name}</span>
              <Select
                value={s.establishment_id ?? "none"}
                onValueChange={(v) =>
                  updateStore.mutate({ storeId: s.id, establishmentId: v === "none" ? null : v })
                }
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder="Anläggning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen anläggning</SelectItem>
                  {establishments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!s.requires_identification_mark}
                  onCheckedChange={(v) => updateStore.mutate({ storeId: s.id, requiresMark: v })}
                />
                <span className="text-[11px] text-muted-foreground">Kräver märke</span>
              </div>
            </div>
          ))}
          {stores.length === 0 && <p className="text-xs text-muted-foreground">Inga butiker upplagda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kunder som mottagare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Slå på för restauranger och andra näringsidkare. Konsument i disk kräver inget märke.
          </p>
          {customers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga kunder registrerade.</p>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                <Switch
                  checked={!!c.requires_identification_mark}
                  onCheckedChange={(v) => updateCustomer.mutate({ customerId: c.id, requiresMark: v })}
                />
                <span className="text-[11px] text-muted-foreground">Kräver märke</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {form?.id ? "Redigera anläggning" : "Ny anläggning"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Namn</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Godkännandenummer</Label>
                <Input
                  value={form.approval_number ?? ""}
                  onChange={(e) => setForm({ ...form, approval_number: e.target.value })}
                  placeholder="6742"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Identifieringsmärke</Label>
                <Input
                  value={form.identification_mark ?? ""}
                  onChange={(e) => setForm({ ...form, identification_mark: e.target.value })}
                  placeholder="SE 6742 EG"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Godkännandetyp</Label>
                <Select
                  value={form.approval_type ?? "FFPP"}
                  onValueChange={(v) => setForm({ ...form, approval_type: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVAL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kontrollmyndighet</Label>
                <Input
                  value={form.control_authority ?? ""}
                  onChange={(e) => setForm({ ...form, control_authority: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Registrerad</Label>
                <Input
                  type="date"
                  value={form.registered_at ?? ""}
                  onChange={(e) => setForm({ ...form, registered_at: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Giltig till</Label>
                <Input
                  type="date"
                  value={form.valid_to ?? ""}
                  onChange={(e) => setForm({ ...form, valid_to: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  checked={form.active ?? true}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <span className="text-xs text-muted-foreground">Aktiv</span>
                <div className="ml-auto">
                  <IdentificationMark
                    markText={form.identification_mark}
                    approvalNumber={form.approval_number}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" className="gap-1 text-xs" onClick={doSave} disabled={save.isPending}>
              <Save className="h-3.5 w-3.5" /> Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
