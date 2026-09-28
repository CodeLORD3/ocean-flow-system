import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, RefreshCw } from "lucide-react";
import { SEGMENTS, toE164, toCsv, downloadCsv } from "@/lib/customerOutreach";

const db = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };
const ALL = "__alla";

type Row = {
  id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  store_id: string | null; home_store_id: string | null; consent_email: boolean; consent_whatsapp: boolean; consent_source: string | null;
  segment: string | null; purchases_90d: number | null; avg_purchase_90d: number | null; tags: string[] | null;
};

async function loadAll(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("customers_retail")
      .select("id,name,first_name,last_name,email,phone,store_id,home_store_id,consent_email,consent_whatsapp,consent_source,segment,purchases_90d,avg_purchase_90d,tags")
      .is("anonymized_at", null).order("name").range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const fmt = (v: number | null) => (v == null ? "saknas" : Math.round(v).toLocaleString("sv-SE").replace(/\u00a0/g, " "));

export default function Kunder() {
  const qc = useQueryClient();
  const { staff, user } = useStaffAuth() as any;
  const [store, setStore] = useState(ALL);
  const [consent, setConsent] = useState(ALL);
  const [segment, setSegment] = useState(ALL);
  const [importing, setImporting] = useState(false);

  const customers = useQuery({ queryKey: ["kunder-utskick"], queryFn: loadAll });
  const stores = useQuery({
    queryKey: ["kunder-butiker"],
    queryFn: async () => (await db.from("stores").select("id,name,country").eq("active", true).order("name")).data ?? [],
  });
  const storeOf = (r: Row) => r.home_store_id ?? r.store_id;
  const country = (r: Row) => ((stores.data ?? []).find((s: any) => s.id === storeOf(r))?.country === "CH" ? "CH" : "SE") as "SE" | "CH";

  const rows = useMemo(() => (customers.data ?? []).filter((r) =>
    (store === ALL || storeOf(r) === store) &&
    (segment === ALL || (segment === "utan" ? !r.segment : r.segment === segment)) &&
    (consent === ALL || (consent === "email" && r.consent_email) || (consent === "whatsapp" && r.consent_whatsapp) || (consent === "ingen" && !r.consent_email && !r.consent_whatsapp)),
  ), [customers.data, store, segment, consent]);

  const filters = { store: store === ALL ? null : store, consent: consent === ALL ? null : consent, segment: segment === ALL ? null : segment };

  const exportCsv = async (format: "shopify" | "whatsapp") => {
    let csv: string, n: number;
    if (format === "shopify") {
      const list = rows.filter((r) => r.consent_email && r.email);
      n = list.length;
      csv = toCsv(["Email", "First Name", "Last Name", "Phone", "Accepts Email Marketing", "Tags"],
        list.map((r) => [r.email, r.first_name ?? "", r.last_name ?? "", toE164(r.phone, country(r)) ?? "", "yes", [r.segment, ...(r.tags ?? [])].filter(Boolean).join(", ")]));
    } else {
      const list = rows.filter((r) => r.consent_whatsapp).map((r) => [r.name ?? [r.first_name, r.last_name].filter(Boolean).join(" "), toE164(r.phone, country(r))]).filter((x) => x[1]);
      n = list.length;
      csv = toCsv(["namn", "telefon"], list);
    }
    if (n === 0) { toast.error("Inga kunder med samtycke för kanalen i urvalet"); return; }
    const { error } = await db.from("customer_exports").insert({
      exported_by: user?.id, exported_by_name: [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || null, format, filters, row_count: n,
    });
    if (error) { toast.error(`Exporten loggades inte: ${error.message}`); return; }
    downloadCsv(`kunder-${format}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${n} kunder exporterade`);
    qc.invalidateQueries({ queryKey: ["kunder-exporter"] });
  };

  const exports = useQuery({
    queryKey: ["kunder-exporter"],
    queryFn: async () => (await db.from("customer_exports").select("*").order("created_at", { ascending: false }).limit(5)).data ?? [],
  });

  const importConsent = async () => {
    setImporting(true);
    try {
      const { data, error } = await db.functions.invoke("shopify-consent-import", { body: {} });
      if (error) throw error;
      const errs = (data?.shops ?? []).filter((s: any) => s.error).map((s: any) => `${s.shop}: ${s.error}`);
      toast.success(`${data.updated} kunder fick e-postsamtycke från Shopify`);
      errs.forEach((e: string) => toast.error(e));
      qc.invalidateQueries({ queryKey: ["kunder-utskick"] });
    } catch (e) { toast.error((e as Error).message); } finally { setImporting(false); }
  };

  const all = customers.data ?? [];
  const bySeg = (s: string | null) => all.filter((r) => r.segment === s).length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kunder för utskick</h1>
          <p className="text-sm text-muted-foreground">
            {SEGMENTS.map((s) => `${s} ${bySeg(s)}`).join(" · ")} · utan köp {bySeg(null)} · samtycke e-post {all.filter((r) => r.consent_email).length}, WhatsApp {all.filter((r) => r.consent_whatsapp).length}
          </p>
        </div>
        <Button variant="outline" onClick={importConsent} disabled={importing}>
          <RefreshCw className="h-4 w-4 mr-1" /> {importing ? "Hämtar…" : "Hämta samtycke från Shopify"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={store} onValueChange={setStore}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alla butiker</SelectItem>
            {(stores.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={consent} onValueChange={setConsent}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alla samtycken</SelectItem>
            <SelectItem value="email">E-post</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="ingen">Inget samtycke</SelectItem>
          </SelectContent>
        </Select>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alla segment</SelectItem>
            {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            <SelectItem value="utan">Utan köp</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm font-mono tabular-nums">{rows.length} träffar</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => exportCsv("shopify")}><Download className="h-4 w-4 mr-1" />Shopify-lista</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv("whatsapp")}><Download className="h-4 w-4 mr-1" />WhatsApp-lista</Button>
        </div>
      </div>

      {customers.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {customers.error && <p className="text-sm text-destructive">{(customers.error as Error).message}</p>}

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="p-2 font-normal">Namn</th><th className="p-2 font-normal">E-post</th><th className="p-2 font-normal">Telefon</th>
              <th className="p-2 font-normal">Segment</th><th className="p-2 font-normal text-right">Köp 90 d</th><th className="p-2 font-normal text-right">Snittköp</th>
              <th className="p-2 font-normal">Samtycke</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name ?? "—"}</td>
                <td className="p-2">{r.email ?? <span className="italic text-muted-foreground">saknas</span>}</td>
                <td className="p-2 font-mono">{toE164(r.phone, country(r)) ?? <span className="italic text-muted-foreground">saknas</span>}</td>
                <td className="p-2">{r.segment ?? <span className="text-muted-foreground">utan köp</span>}</td>
                <td className="p-2 text-right font-mono tabular-nums">{r.purchases_90d ?? "saknas"}</td>
                <td className="p-2 text-right font-mono tabular-nums">{r.purchases_90d ? fmt(r.avg_purchase_90d) : "saknas"}</td>
                <td className="p-2 text-xs">{[r.consent_email && `E-post${r.consent_source ? ` (${r.consent_source})` : ""}`, r.consent_whatsapp && "WhatsApp"].filter(Boolean).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 && <p className="p-2 text-xs text-muted-foreground">Visar 300 av {rows.length}. Exporten tar med alla träffar.</p>}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">Senaste exporter</div>
        {(exports.data ?? []).length === 0 ? <div>Inga exporter ännu.</div> : (exports.data ?? []).map((e: any) => (
          <div key={e.id}>{new Date(e.created_at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })} · {e.exported_by_name ?? "okänd"} · {e.format} · {e.row_count} kunder</div>
        ))}
      </div>
    </div>
  );
}
