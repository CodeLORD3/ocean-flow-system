import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { NumberField, parseNumber } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: any) => any };

type Line = { week_start: string; direction: "in" | "ut"; category: string; amount: number | null; quality: "fakta" | "skattning" | "saknas"; note: string | null };

const ENTITIES: { code: string; name: string }[] = [
  { code: "fsab-se", name: "Fisk & Skaldjursspecialisten No.1 AB" },
  { code: "de-no1", name: "DE No.1 AB" },
  { code: "fsab-ch", name: "Componia AG" },
];
const fmt = (v: number | null | undefined) =>
  v == null ? null : Math.round(Number(v)).toLocaleString("sv-SE").replace(/\u00a0/g, " ");
const Money = ({ v }: { v: number | null | undefined }) =>
  v == null ? <span className="italic text-muted-foreground">saknas</span> : <span className="font-mono tabular-nums">{fmt(v)}</span>;
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d: Date) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const isoWeek = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7)); const y = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return 1 + Math.round(((x.getTime() - y.getTime()) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7); };
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

const QUALITY_CLASS: Record<string, string> = {
  fakta: "text-foreground",
  skattning: "text-muted-foreground",
  saknas: "text-destructive",
};

export default function Likviditet() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState("fsab-se");
  const start = useMemo(() => mondayOf(new Date()), []);
  const weeks = useMemo(() => Array.from({ length: 13 }, (_, i) => addDays(start, i * 7)), [start]);

  const lines = useQuery({
    queryKey: ["likviditet", entity, start],
    queryFn: async () => {
      const { data, error } = await db.rpc("likviditet_veckor", { _entity: entity, _start: start });
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });
  const balances = useQuery({
    queryKey: ["bank-balances", entity],
    queryFn: async () => {
      const { data, error } = await db.from("bank_balances").select("*").eq("legal_entity_code", entity).order("balance_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const taxes = useQuery({
    queryKey: ["tax-calendar", entity],
    queryFn: async () => {
      const { data, error } = await db.from("tax_calendar").select("*").eq("legal_entity_code", entity).order("due_date");
      if (error) throw error;
      return data as any[];
    },
  });
  const suppliers = useQuery({
    queryKey: ["supplier-invoices", entity],
    queryFn: async () => {
      const { data, error } = await db.from("fortnox_supplier_invoices").select("*").eq("legal_entity_code", entity).eq("paid", false).order("due_date");
      if (error) throw error;
      return data as any[];
    },
  });

  const opening = (balances.data ?? []).find((b) => b.balance_date <= start) ?? (balances.data ?? [])[0] ?? null;

  const categories = useMemo(() => {
    const keys = new Map<string, { direction: string; category: string }>();
    for (const l of lines.data ?? []) keys.set(`${l.direction}|${l.category}`, { direction: l.direction, category: l.category });
    return [...keys.values()].sort((a, b) => (a.direction === b.direction ? a.category.localeCompare(b.category, "sv") : a.direction === "in" ? -1 : 1));
  }, [lines.data]);

  const cell = (dir: string, cat: string, w: string) => (lines.data ?? []).filter((l) => l.direction === dir && l.category === cat && l.week_start === w);
  const net = weeks.map((w) => (lines.data ?? []).filter((l) => l.week_start === w)
    .reduce((s, l) => s + (l.amount == null ? 0 : l.direction === "in" ? Number(l.amount) : -Number(l.amount)), 0));
  const running: (number | null)[] = [];
  weeks.forEach((_, i) => {
    const prev = i === 0 ? (opening ? Number(opening.balance) : null) : running[i - 1];
    running.push(prev == null ? null : prev + net[i]);
  });

  const refresh = () => { ["likviditet", "bank-balances", "tax-calendar"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };

  const [bank, setBank] = useState({ balance_date: new Date().toISOString().slice(0, 10), balance: "" });
  const saveBank = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("bank_balances").upsert({ legal_entity_code: entity, balance_date: bank.balance_date, balance: parseNumber(bank.balance) ?? 0 }, { onConflict: "legal_entity_code,balance_date" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Banksaldo sparat"); setBank({ ...bank, balance: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [tax, setTax] = useState({ tax_type: "Moms", due_date: "", amount: "", estimated: true });
  const saveTax = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("tax_calendar").insert({ legal_entity_code: entity, tax_type: tax.tax_type, due_date: tax.due_date, amount: Number(tax.amount.replace(/\s/g, "").replace(",", ".")), estimated: tax.estimated });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Skattedatum sparat"); setTax({ ...tax, amount: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Likviditet 13 veckor</h1>
          <p className="text-sm text-muted-foreground">Belopp i bolagets valuta. Varje rad är märkt fakta, skattning eller saknas.</p>
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>{ENTITIES.map((e) => <SelectItem key={e.code} value={e.code}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="prognos">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="prognos">Prognos</TabsTrigger>
          <TabsTrigger value="bank">Banksaldo</TabsTrigger>
          <TabsTrigger value="skatt">Skattekalender</TabsTrigger>
          <TabsTrigger value="lev">Leverantörsfakturor</TabsTrigger>
        </TabsList>

        <TabsContent value="prognos" className="space-y-2">
          {lines.error && <p className="text-sm text-destructive">{(lines.error as Error).message}</p>}
          <p className="text-sm">
            Ingående saldo:{" "}
            {opening ? <><Money v={opening.balance} /> <span className="text-muted-foreground">({opening.balance_date}, fakta)</span></> : <span className="italic text-destructive">saknas – lägg in under Banksaldo</span>}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Post</TableHead>
                  {weeks.map((w) => <TableHead key={w} className="text-right whitespace-nowrap">v{isoWeek(w)}<div className="text-[10px] font-normal">{dayLabel(w)}</div></TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(({ direction, category }) => (
                  <TableRow key={`${direction}${category}`}>
                    <TableCell className="text-sm">
                      <span className="mr-1 font-mono text-xs text-muted-foreground">{direction === "in" ? "IN" : "UT"}</span>{category}
                    </TableCell>
                    {weeks.map((w) => {
                      const c = cell(direction, category, w);
                      if (!c.length) return <TableCell key={w} />;
                      const amount = c.every((x) => x.amount == null) ? null : c.reduce((s, x) => s + Number(x.amount ?? 0), 0);
                      const q = c.some((x) => x.quality === "saknas") ? "saknas" : c.some((x) => x.quality === "skattning") ? "skattning" : "fakta";
                      return (
                        <TableCell key={w} className={`text-right text-sm ${QUALITY_CLASS[q]}`} title={`${q}${c[0].note ? ` · ${c[0].note}` : ""}`}>
                          <Money v={amount == null ? null : direction === "ut" ? -amount : amount} />
                          <div className="text-[10px]">{q}</div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                <TableRow className="font-medium">
                  <TableCell>Netto</TableCell>
                  {net.map((n, i) => <TableCell key={i} className="text-right"><Money v={n} /></TableCell>)}
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>Utgående saldo</TableCell>
                  {running.map((r, i) => (
                    <TableCell key={i} className={`text-right ${r != null && r < 0 ? "bg-destructive/10 text-destructive" : ""}`}>
                      <Money v={r} />{r != null && r < 0 && <div className="text-[10px]">under noll</div>}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Håll muspekaren över en cell för underlaget. Förfallna fakturor ligger i första veckan.</p>
        </TabsContent>

        <TabsContent value="bank" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Datum</Label><Input type="date" className="h-8" value={bank.balance_date} onChange={(e) => setBank({ ...bank, balance_date: e.target.value })} /></div>
            <div><Label className="text-xs">Saldo</Label><NumberField allowNegative className="h-8 sm:h-8 w-40 text-left" value={bank.balance} onValueChange={(raw) => setBank({ ...bank, balance: raw })} /></div>
            <Button size="sm" disabled={!bank.balance || saveBank.isPending} onClick={() => saveBank.mutate()}>Spara</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(balances.data ?? []).map((b) => (
                <TableRow key={b.id}><TableCell>{b.balance_date}</TableCell><TableCell className="text-right"><Money v={b.balance} /></TableCell>
                  <TableCell className="w-10"><Button variant="ghost" size="icon" onClick={() => del.mutate({ table: "bank_balances", id: b.id })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="skatt" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Typ</Label><Input className="h-8 w-40" value={tax.tax_type} onChange={(e) => setTax({ ...tax, tax_type: e.target.value })} /></div>
            <div><Label className="text-xs">Förfallodatum</Label><Input type="date" className="h-8" value={tax.due_date} onChange={(e) => setTax({ ...tax, due_date: e.target.value })} /></div>
            <div><Label className="text-xs">Belopp</Label><Input className="h-8 w-36 font-mono" inputMode="decimal" value={tax.amount} onChange={(e) => setTax({ ...tax, amount: e.target.value })} /></div>
            <label className="flex h-8 items-center gap-2 text-sm"><Checkbox checked={tax.estimated} onCheckedChange={(v) => setTax({ ...tax, estimated: v === true })} />Skattat</label>
            <Button size="sm" disabled={!tax.due_date || !tax.amount || !tax.tax_type || saveTax.isPending} onClick={() => saveTax.mutate()}>Lägg till</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Förfaller</TableHead><TableHead>Typ</TableHead><TableHead className="text-right">Belopp</TableHead><TableHead>Märkning</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(taxes.data ?? []).map((t) => (
                <TableRow key={t.id}><TableCell>{t.due_date}</TableCell><TableCell>{t.tax_type}</TableCell><TableCell className="text-right"><Money v={t.amount} /></TableCell>
                  <TableCell>{t.estimated ? "skattning" : "fakta"}</TableCell>
                  <TableCell className="w-10"><Button variant="ghost" size="icon" onClick={() => del.mutate({ table: "tax_calendar", id: t.id })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="lev">
          <p className="mb-2 text-sm text-muted-foreground">{suppliers.data?.length ?? 0} obetalda, hämtas från Fortnox varje natt 04:30.</p>
          <Table>
            <TableHeader><TableRow><TableHead>Förfaller</TableHead><TableHead>Leverantör</TableHead><TableHead>Faktura</TableHead><TableHead>Fakturadatum</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
            <TableBody>
              {(suppliers.data ?? []).map((s) => (
                <TableRow key={s.id}><TableCell>{s.due_date ?? "–"}</TableCell><TableCell>{s.supplier_name}</TableCell><TableCell className="font-mono">{s.invoice_number}</TableCell>
                  <TableCell>{s.invoice_date}</TableCell><TableCell className="text-right"><Money v={s.balance} /> {s.currency}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
