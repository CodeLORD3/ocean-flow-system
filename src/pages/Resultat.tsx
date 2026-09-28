import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PurchaseStorePicker, useActiveStores } from "@/components/purchase/PurchaseStorePicker";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: any) => any };

type Row = {
  legal_entity_id: string; store_id: string; store_name: string; month: string;
  sales_sek: number | null; sales_days: number;
  raw_purchase_sek: number | null; raw_ic_sek: number | null;
  staff_hours: number | null; staff_cost_sek: number | null; staff_hours_without_rate: number | null;
  fixed_cost_sek: number | null;
  budget_sales: number | null; budget_raw: number | null; budget_staff: number | null; budget_rent: number | null; budget_other: number | null;
};
type Booked = { legal_entity_code: string; month: string; cost_center: string | null; revenue: number | null; raw_material: number | null; other_external: number | null; staff: number | null };

const ENTITY: Record<string, string> = { "de-no1": "DE No.1 AB", "fsab-se": "Fisk & Skaldjursspecialisten No.1 AB", "fsab-ch": "Componia AG" };
const num = (v: number | null | undefined) =>
  v == null ? null : Math.round(Number(v)).toLocaleString("sv-SE").replace(/\u00a0/g, " ");
const Money = ({ v, missing = "saknas" }: { v: number | null | undefined; missing?: string }) =>
  v == null ? <span className="text-muted-foreground italic">{missing}</span> : <span className="font-mono tabular-nums">{num(v)}</span>;
const monthLabel = (m: string) => new Date(`${m.slice(0, 10)}T12:00:00Z`).toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const sumOrNull = (...v: (number | null)[]) => (v.every((x) => x == null) ? null : v.reduce<number>((s, x) => s + Number(x ?? 0), 0));

function derive(r: Row) {
  const raw = sumOrNull(r.raw_purchase_sek, r.raw_ic_sek);
  const missing: string[] = [];
  if (r.sales_sek == null) missing.push("försäljning");
  if (raw == null) missing.push("råvara");
  if (r.staff_cost_sek == null) missing.push("personal");
  if (r.fixed_cost_sek == null) missing.push("fasta");
  const result = r.sales_sek == null ? null : Number(r.sales_sek) - Number(raw ?? 0) - Number(r.staff_cost_sek ?? 0) - Number(r.fixed_cost_sek ?? 0);
  const margin = result != null && r.sales_sek && missing.length === 0 ? (result / Number(r.sales_sek)) * 100 : null;
  const budgetResult = r.budget_sales == null ? null
    : Number(r.budget_sales) - Number(r.budget_raw ?? 0) - Number(r.budget_staff ?? 0) - Number(r.budget_rent ?? 0) - Number(r.budget_other ?? 0);
  return { raw, result, margin, missing, budgetResult };
}

export default function Resultat() {
  const [from, setFrom] = useState("2026-08");
  const [to, setTo] = useState("2026-09");
  const fromDate = `${from}-01`;
  const toDate = lastDay(to);

  const rows = useQuery({
    queryKey: ["resultat", "butik", fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await db.rpc("resultat_per_butik", { _from: fromDate, _to: toDate });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const booked = useQuery({
    queryKey: ["resultat", "bokfort", fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await db.rpc("resultat_bokfort", { _from: fromDate, _to: toDate });
      if (error) throw error;
      return (data ?? []) as Booked[];
    },
  });

  const byEntity = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows.data ?? []) m.set(r.legal_entity_id, [...(m.get(r.legal_entity_id) ?? []), r]);
    return [...m.entries()];
  }, [rows.data]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Resultat per butik</h1>
          <p className="text-sm text-muted-foreground">Belopp i SEK ex moms. "saknas" betyder att indata saknas, inte noll.</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">Från</Label><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" /></div>
          <div><Label className="text-xs">Till</Label><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" /></div>
        </div>
      </div>

      <Tabs defaultValue="resultat">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resultat">Resultat</TabsTrigger>
          <TabsTrigger value="bokfort">Bokfört (Fortnox)</TabsTrigger>
          <TabsTrigger value="inkop">Fördela inköp</TabsTrigger>
          <TabsTrigger value="personal">Personalkostnad</TabsTrigger>
          <TabsTrigger value="fasta">Fasta kostnader</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="resultat" className="space-y-6">
          {rows.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
          {rows.error && <p className="text-sm text-destructive">{(rows.error as Error).message}</p>}
          {byEntity.map(([entity, list]) => (
            <div key={entity} className="space-y-2">
              <h2 className="font-semibold">{ENTITY[entity] ?? entity}</h2>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Butik</TableHead><TableHead>Månad</TableHead>
                      <TableHead className="text-right">Försäljning</TableHead>
                      <TableHead className="text-right">Råvara</TableHead>
                      <TableHead className="text-right">Personal</TableHead>
                      <TableHead className="text-right">Hyra/fasta</TableHead>
                      <TableHead className="text-right">Resultat</TableHead>
                      <TableHead className="text-right">Marginal</TableHead>
                      <TableHead className="text-right">Budget res.</TableHead>
                      <TableHead className="text-right">Mot budget</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((r) => {
                      const d = derive(r);
                      return (
                        <TableRow key={`${r.store_id}-${r.month}`}>
                          <TableCell className="font-medium">{r.store_name}</TableCell>
                          <TableCell className="capitalize">{monthLabel(r.month)}</TableCell>
                          <TableCell className="text-right" title={`${r.sales_days} dagar med rapport`}><Money v={r.sales_sek} /></TableCell>
                          <TableCell className="text-right" title={r.raw_ic_sek != null ? `varav intercompany ${num(r.raw_ic_sek)}` : undefined}><Money v={d.raw} /></TableCell>
                          <TableCell className="text-right" title={r.staff_hours != null ? `${Number(r.staff_hours).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} h` : "inga timmar"}>
                            {r.staff_cost_sek == null && r.staff_hours != null
                              ? <span className="text-muted-foreground italic">saknas ({Number(r.staff_hours).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} h utan timkostnad)</span>
                              : <Money v={r.staff_cost_sek} />}
                          </TableCell>
                          <TableCell className="text-right"><Money v={r.fixed_cost_sek} /></TableCell>
                          <TableCell className="text-right">
                            <Money v={d.result} />
                            {d.result != null && d.missing.length > 0 && (
                              <div className="text-[10px] text-muted-foreground">ofullständigt: {d.missing.join(", ")}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {d.margin == null ? <span className="text-muted-foreground italic">saknas</span> : `${d.margin.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`}
                          </TableCell>
                          <TableCell className="text-right"><Money v={d.budgetResult} /></TableCell>
                          <TableCell className="text-right">
                            {d.result == null || d.budgetResult == null ? <span className="text-muted-foreground italic">saknas</span>
                              : <span className={`font-mono tabular-nums ${d.result - d.budgetResult < 0 ? "text-destructive" : ""}`}>{num(d.result - d.budgetResult)}</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="bokfort">
          <BookedTable data={booked.data ?? []} loading={booked.isLoading} />
        </TabsContent>
        <TabsContent value="inkop"><PurchaseAllocation from={fromDate} to={toDate} /></TabsContent>
        <TabsContent value="personal"><StaffRates /></TabsContent>
        <TabsContent value="fasta"><FixedCosts /></TabsContent>
        <TabsContent value="budget"><Budget year={Number(from.slice(0, 4))} /></TabsContent>
      </Tabs>
    </div>
  );
}

function BookedTable({ data, loading }: { data: Booked[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Laddar…</p>;
  if (!data.length) return <p className="text-sm text-muted-foreground">Inga bokförda saldon för perioden ännu.</p>;
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bolag</TableHead><TableHead>Månad</TableHead><TableHead>Kostnadsställe</TableHead>
            <TableHead className="text-right">Intäkter 3xxx</TableHead><TableHead className="text-right">Råvara 4xxx</TableHead>
            <TableHead className="text-right">Övr. externa 5–6xxx</TableHead><TableHead className="text-right">Personal 7xxx</TableHead>
            <TableHead className="text-right">Resultat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((b, i) => {
            const res = b.revenue == null && b.raw_material == null && b.other_external == null && b.staff == null ? null
              : Number(b.revenue ?? 0) - Number(b.raw_material ?? 0) - Number(b.other_external ?? 0) - Number(b.staff ?? 0);
            return (
              <TableRow key={i}>
                <TableCell>{ENTITY[b.legal_entity_code] ?? b.legal_entity_code}</TableCell>
                <TableCell className="capitalize">{monthLabel(b.month)}</TableCell>
                <TableCell>{b.cost_center ?? <span className="text-muted-foreground">utan kostnadsställe</span>}</TableCell>
                <TableCell className="text-right"><Money v={b.revenue} missing="–" /></TableCell>
                <TableCell className="text-right"><Money v={b.raw_material} missing="–" /></TableCell>
                <TableCell className="text-right"><Money v={b.other_external} missing="–" /></TableCell>
                <TableCell className="text-right"><Money v={b.staff} missing="–" /></TableCell>
                <TableCell className="text-right"><Money v={res} missing="–" /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchaseAllocation({ from, to }: { from: string; to: string }) {
  const [onlyMissing, setOnlyMissing] = useState(true);
  const q = useQuery({
    queryKey: ["resultat", "inkop", from, to],
    queryFn: async () => {
      const { data, error } = await db.from("purchase_reports")
        .select("id, display_name, file_name, supplier_name_raw, document_date, report_date, total_ex_vat, total_amount, legal_entity_id, store_id")
        .is("archived_at", null)
        .or(`and(document_date.gte.${from},document_date.lte.${to}),and(document_date.is.null,report_date.gte.${from},report_date.lte.${to})`)
        .order("document_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const list = (q.data ?? []).filter((r) => !onlyMissing || !r.store_id);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <input id="om" type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        <label htmlFor="om">Visa bara inköp utan butik</label>
        <span className="text-muted-foreground">· {list.length} st. Raden kan få egen butik i inköpsarkivet; rapportens butik gäller annars.</span>
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Leverantör / fil</TableHead><TableHead>Bolag</TableHead><TableHead className="text-right">Belopp ex moms</TableHead><TableHead>Butik</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.document_date ?? r.report_date ?? "—"}</TableCell>
                <TableCell>{r.supplier_name_raw || r.display_name || r.file_name}</TableCell>
                <TableCell>{r.legal_entity_id ?? <span className="text-muted-foreground italic">saknas</span>}</TableCell>
                <TableCell className="text-right"><Money v={r.total_ex_vat ?? r.total_amount} /></TableCell>
                <TableCell><PurchaseStorePicker table="purchase_reports" id={r.id} value={r.store_id} onSaved={() => q.refetch()} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function useCrud(table: string, order: string) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["resultat", table],
    queryFn: async () => {
      const { data, error } = await db.from(table).select("*").order(order, { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const done = () => { qc.invalidateQueries({ queryKey: ["resultat"] }); };
  const upsert = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await db.from(table).upsert(row, table === "store_budget" ? { onConflict: "store_id,year,month" } : undefined);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sparat"); done(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from(table).delete().eq("id", id); if (error) throw error; },
    onSuccess: done,
    onError: (e) => toast.error((e as Error).message),
  });
  return { list, upsert, remove };
}

const ALL = "__alla";
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".").replace(/\s/g, "")));

function StorePick({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const { data: stores = [] } = useActiveStores();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Butik" /></SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>Alla butiker i bolaget</SelectItem>}
        {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function StaffRates() {
  const { list, upsert, remove } = useCrud("staff_cost_rates", "valid_from");
  const { data: stores = [] } = useActiveStores();
  const [f, setF] = useState({ legal_entity_id: "fsab-se", store: ALL, cost: "", from: "2026-01-01" });
  const name = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? id : "Alla butiker");
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Kostnad per timme inklusive arbetsgivaravgifter, semester och pension. Butiksrad går före bolagsrad.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">Bolag</Label>
          <Select value={f.legal_entity_id} onValueChange={(v) => setF({ ...f, legal_entity_id: v })}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ENTITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs">Butik</Label><StorePick value={f.store} onChange={(v) => setF({ ...f, store: v })} allowAll /></div>
        <div><Label className="text-xs">Kr per timme</Label><Input className="h-8 w-28" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></div>
        <div><Label className="text-xs">Från och med</Label><Input type="date" className="h-8 w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <Button size="sm" onClick={() => {
          const c = numOrNull(f.cost);
          if (c == null || Number.isNaN(c)) return toast.error("Ange kostnad per timme.");
          upsert.mutate({ legal_entity_id: f.legal_entity_id, store_id: f.store === ALL ? null : f.store, cost_per_hour: c, valid_from: f.from });
        }}>Lägg till</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Bolag</TableHead><TableHead>Butik</TableHead><TableHead className="text-right">Kr/h</TableHead><TableHead>Från</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(list.data ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell>{ENTITY[r.legal_entity_id] ?? r.legal_entity_id}</TableCell><TableCell>{name(r.store_id)}</TableCell>
              <TableCell className="text-right"><Money v={r.cost_per_hour} /></TableCell><TableCell>{r.valid_from}</TableCell>
              <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FixedCosts() {
  const { list, upsert, remove } = useCrud("store_fixed_costs", "valid_from");
  const { data: stores = [] } = useActiveStores();
  const [f, setF] = useState({ store: "", type: "Hyra", amount: "", currency: "SEK", from: "2026-01-01", to: "" });
  const name = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">Butik</Label><StorePick value={f.store} onChange={(v) => setF({ ...f, store: v })} /></div>
        <div><Label className="text-xs">Kostnadsslag</Label><Input className="h-8 w-36" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></div>
        <div><Label className="text-xs">Belopp/månad</Label><Input className="h-8 w-28" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><Label className="text-xs">Valuta</Label>
          <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="SEK">SEK</SelectItem><SelectItem value="CHF">CHF</SelectItem></SelectContent>
          </Select></div>
        <div><Label className="text-xs">Från och med</Label><Input type="date" className="h-8 w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><Label className="text-xs">Till och med</Label><Input type="date" className="h-8 w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <Button size="sm" onClick={() => {
          const a = numOrNull(f.amount);
          if (!f.store || !f.type.trim() || a == null || Number.isNaN(a)) return toast.error("Välj butik, kostnadsslag och belopp.");
          upsert.mutate({ store_id: f.store, cost_type: f.type.trim(), amount_per_month: a, currency: f.currency, valid_from: f.from, valid_to: f.to || null });
        }}>Lägg till</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Butik</TableHead><TableHead>Kostnadsslag</TableHead><TableHead className="text-right">Per månad</TableHead><TableHead>Från</TableHead><TableHead>Till</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(list.data ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell>{name(r.store_id)}</TableCell><TableCell>{r.cost_type}</TableCell>
              <TableCell className="text-right"><Money v={r.amount_per_month} /> {r.currency}</TableCell>
              <TableCell>{r.valid_from}</TableCell><TableCell>{r.valid_to ?? "tills vidare"}</TableCell>
              <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const BUDGET_FIELDS = [["sales", "Försäljning"], ["raw_material", "Råvara"], ["staff", "Personal"], ["rent", "Hyra"], ["other", "Övrigt"]] as const;

function Budget({ year: initialYear }: { year: number }) {
  const { list, upsert, remove } = useCrud("store_budget", "year");
  const { data: stores = [] } = useActiveStores();
  const [year, setYear] = useState(initialYear);
  const [store, setStore] = useState("");
  const [month, setMonth] = useState("9");
  const [vals, setVals] = useState<Record<string, string>>({});
  const name = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  const rows = (list.data ?? []).filter((r) => r.year === year).sort((a, b) => name(a.store_id).localeCompare(name(b.store_id)) || a.month - b.month);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Belopp i SEK per månad. Tomt fält = ingen budget för det slaget.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">År</Label><Input type="number" className="h-8 w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
        <div><Label className="text-xs">Månad</Label><Input type="number" min={1} max={12} className="h-8 w-20" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <div><Label className="text-xs">Butik</Label><StorePick value={store} onChange={setStore} /></div>
        {BUDGET_FIELDS.map(([k, l]) => (
          <div key={k}><Label className="text-xs">{l}</Label><Input className="h-8 w-28" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></div>
        ))}
        <Button size="sm" onClick={() => {
          const m = Number(month);
          if (!store || !(m >= 1 && m <= 12)) return toast.error("Välj butik och månad 1–12.");
          const row: any = { store_id: store, year, month: m };
          for (const [k] of BUDGET_FIELDS) row[k] = numOrNull(vals[k] ?? "");
          upsert.mutate(row);
        }}>Spara</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Butik</TableHead><TableHead>Månad</TableHead>{BUDGET_FIELDS.map(([k, l]) => <TableHead key={k} className="text-right">{l}</TableHead>)}<TableHead /></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => {
              setStore(r.store_id); setMonth(String(r.month));
              setVals(Object.fromEntries(BUDGET_FIELDS.map(([k]) => [k, r[k] == null ? "" : String(r[k])])));
            }}>
              <TableCell>{name(r.store_id)}</TableCell><TableCell>{r.month}</TableCell>
              {BUDGET_FIELDS.map(([k]) => <TableCell key={k} className="text-right"><Money v={r[k]} /></TableCell>)}
              <TableCell><Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
