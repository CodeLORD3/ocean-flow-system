import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Save, ArrowRightLeft, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useStores } from "@/hooks/useStores";
import {
  useIntercompanyInvoices,
  useLegalEntities,
  useMoveStoreToCompany,
  useSaveLegalEntity,
  useStoreCompanyPeriods,
  type LegalEntity,
} from "@/hooks/useLegalEntities";

const num = (v: number, cur: string) =>
  `${v.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ",")} ${cur}`;

export default function LegalEntitiesPage() {
  const { data: entities = [], isLoading } = useLegalEntities();
  const { data: periods = [] } = useStoreCompanyPeriods();
  const { data: invoices = [] } = useIntercompanyInvoices();
  const { data: stores = [] } = useStores();
  const save = useSaveLegalEntity();
  const move = useMoveStoreToCompany();

  const [draft, setDraft] = useState<Record<string, Partial<LegalEntity>>>({});
  const [moveForm, setMoveForm] = useState<{ store_id: string; legal_entity_id: string; valid_from: string }>({
    store_id: "",
    legal_entity_id: "",
    valid_from: new Date().toISOString().slice(0, 10),
  });

  const storeName = (id: string) => stores.find((s: any) => s.id === id)?.name ?? "Okänd butik";
  const entityName = (id: string) => entities.find((e) => e.legal_entity_id === id)?.legal_name ?? id;

  const openPeriods = useMemo(() => periods.filter((p) => !p.valid_to), [periods]);
  const closedPeriods = useMemo(() => periods.filter((p) => p.valid_to), [periods]);

  const field = (e: LegalEntity, key: keyof LegalEntity) =>
    (draft[e.legal_entity_id]?.[key] ?? e[key] ?? "") as string;

  const setField = (id: string, key: keyof LegalEntity, value: any) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));

  const doSave = async (e: LegalEntity) => {
    try {
      await save.mutateAsync({ ...e, ...draft[e.legal_entity_id], legal_entity_id: e.legal_entity_id });
      setDraft((d) => ({ ...d, [e.legal_entity_id]: {} }));
      toast.success("Bolaget är sparat.");
    } catch (err: any) {
      toast.error(err.message || "Bolaget kunde inte sparas.");
    }
  };

  const doMove = async () => {
    if (!moveForm.store_id || !moveForm.legal_entity_id) {
      toast.error("Välj både butik och bolag.");
      return;
    }
    try {
      await move.mutateAsync(moveForm);
      toast.success("Butiken tillhör nytt bolag från angivet datum. Historiken är kvar.");
      setMoveForm({ store_id: "", legal_entity_id: "", valid_from: new Date().toISOString().slice(0, 10) });
    } catch (err: any) {
      toast.error(err.message || "Flytten kunde inte sparas.");
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="bolag">
        <TabsList>
          <TabsTrigger value="bolag" className="gap-2">
            <Building2 className="h-4 w-4" /> Bolag
          </TabsTrigger>
          <TabsTrigger value="perioder" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Butikstillhörighet
          </TabsTrigger>
          <TabsTrigger value="internfakturor" className="gap-2">
            <ReceiptText className="h-4 w-4" /> Internfakturor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bolag" className="space-y-3 pt-3">
          {isLoading && <p className="text-sm text-muted-foreground">Hämtar bolag…</p>}
          {!isLoading && entities.length === 0 && (
            <EmptyState
              icon={<Building2 className="h-4 w-4" />}
              title="Inga bolag"
              description="Bolagsregistret är tomt. Lägg upp koncernens bolag för att kunna knyta butiker och rörelser till rätt juridisk enhet."
            />
          )}
          {entities.map((e) => (
            <Card key={e.legal_entity_id}>
              <CardHeader className="flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-base">
                  {e.legal_name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">{e.legal_entity_id}</span>
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Badge variant={e.active ? "default" : "secondary"}>{e.active ? "Aktivt" : "Vilande"}</Badge>
                  <Switch
                    checked={(draft[e.legal_entity_id]?.active ?? e.active) as boolean}
                    onCheckedChange={(v) => setField(e.legal_entity_id, "active", v)}
                  />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>Namn</Label>
                  <Input value={field(e, "legal_name")} onChange={(ev) => setField(e.legal_entity_id, "legal_name", ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Organisationsnummer</Label>
                  <Input value={field(e, "org_nr")} onChange={(ev) => setField(e.legal_entity_id, "org_nr", ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Momsregistrering</Label>
                  <Input value={field(e, "vat_registration")} onChange={(ev) => setField(e.legal_entity_id, "vat_registration", ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Land</Label>
                  <Input value={field(e, "country")} onChange={(ev) => setField(e.legal_entity_id, "country", ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Valuta</Label>
                  <Input value={field(e, "currency")} onChange={(ev) => setField(e.legal_entity_id, "currency", ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Momsregim</Label>
                  <Input
                    placeholder="SE eller CH"
                    value={field(e, "vat_regime")}
                    onChange={(ev) => setField(e.legal_entity_id, "vat_regime", ev.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bokslutsdag</Label>
                  <Input placeholder="12-31" value={field(e, "fiscal_year_end")} onChange={(ev) => setField(e.legal_entity_id, "fiscal_year_end", ev.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => doSave(e)} disabled={save.isPending} className="gap-2">
                    <Save className="h-4 w-4" /> Spara
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="perioder" className="space-y-4 pt-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Flytta butik till annat bolag</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Butik</Label>
                <Select value={moveForm.store_id} onValueChange={(v) => setMoveForm((f) => ({ ...f, store_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj butik" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nytt bolag</Label>
                <Select value={moveForm.legal_entity_id} onValueChange={(v) => setMoveForm((f) => ({ ...f, legal_entity_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj bolag" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.legal_entity_id} value={e.legal_entity_id}>
                        {e.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Gäller från</Label>
                <Input type="date" value={moveForm.valid_from} onChange={(ev) => setMoveForm((f) => ({ ...f, valid_from: ev.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button onClick={doMove} disabled={move.isPending} className="gap-2">
                  <ArrowRightLeft className="h-4 w-4" /> Flytta
                </Button>
              </div>
              <p className="md:col-span-4 text-xs text-muted-foreground">
                Rörelser som redan skett behåller det bolag som ägde butiken den dagen. Inget klassas om i efterhand.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Gäller nu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {openPeriods.length === 0 && <p className="text-sm text-muted-foreground">Ingen butik har bolagstillhörighet ännu.</p>}
              {openPeriods.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm">
                  <span>{storeName(p.store_id)}</span>
                  <span className="text-muted-foreground">{entityName(p.legal_entity_id)}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">från {p.valid_from}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {closedPeriods.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Historik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {closedPeriods.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm">
                    <span>{storeName(p.store_id)}</span>
                    <span className="text-muted-foreground">{entityName(p.legal_entity_id)}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {p.valid_from} – {p.valid_to}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="internfakturor" className="pt-3">
          {invoices.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="h-4 w-4" />}
              title="Inga internfakturor"
              description="Underlag skapas automatiskt när en överföring går mellan lagerplatser som tillhör olika bolag. Överföringar inom samma bolag ger inget underlag."
            />
          ) : (
            <Card>
              <CardContent className="pt-4 space-y-1">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm">
                    <span>
                      {entityName(inv.seller_legal_entity_id)} → {entityName(inv.buyer_legal_entity_id)}
                    </span>
                    <span className="font-mono text-xs tabular-nums">{num(Number(inv.amount_ex_vat), inv.currency)}</span>
                    <Badge variant="secondary">{inv.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
