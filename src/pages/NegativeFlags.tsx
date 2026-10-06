import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Row {
  id: string; created_at: string; product_id: string; location_id: string;
  movement_type: string | null; movement_qty: number | null; resulting_qty: number;
  product_name: string; location_name: string; store_name: string | null;
  fix_at: string | null; fix_type: string | null; sannolik_orsak: string;
}

const ORSAK: Record<string, string> = {
  forsaljning_utan_registrering: "Försäljning utan registrering",
  omvandling_saknas: "Omvandling saknas",
  inventering_rattat: "Inventering har rättat",
};
const ACK_REASONS = [
  "Försäljning utan registrering", "Omvandling saknas", "Rättad vid inventering",
  "Våg/spill", "Delad förpackning", "Felregistrering", "Övrigt",
];
const fmtDate = (v: string) => new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const kg = (n: number) => Number(n || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function NegativeFlags() {
  const qc = useQueryClient();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [orsakFilter, setOrsakFilter] = useState("alla");

  const q = useQuery({
    queryKey: ["v_negative_flags_review"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_negative_flags_review" as any)
        .select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const note = reason[id];
      if (!note) throw new Error("Välj orsak först");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("stock_negative_flags" as any).update({
        acknowledged_at: new Date().toISOString(), acknowledged_by: u.user?.id ?? null, ack_note: note,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["v_negative_flags_review"] }); toast({ title: "Kvitterad" }); },
    onError: (e: any) => toast({ title: "Kunde inte kvittera", description: e.message, variant: "destructive" }),
  });

  const rows = (q.data ?? []).filter((r) => orsakFilter === "alla" || r.sannolik_orsak === orsakFilter);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (q.data ?? []).forEach((r) => (c[r.sannolik_orsak] = (c[r.sannolik_orsak] ?? 0) + 1));
    return c;
  }, [q.data]);

  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, Row[]>>();
    rows.forEach((r) => {
      const s = r.store_name ?? r.location_name;
      if (!m.has(s)) m.set(s, new Map());
      const pm = m.get(s)!;
      const key = `${r.product_name} · ${r.location_name}`;
      if (!pm.has(key)) pm.set(key, []);
      pm.get(key)!.push(r);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [rows]);

  return (
    <div className="space-y-4 p-4 max-w-5xl">
      <h1 className="text-2xl font-semibold">Negativa saldon att kvittera</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant="outline">Totalt {q.data?.length ?? 0}</Badge>
        {Object.entries(ORSAK).map(([k, v]) => <Badge key={k} variant="secondary">{v}: {counts[k] ?? 0}</Badge>)}
        <Select value={orsakFilter} onValueChange={setOrsakFilter}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla orsaker</SelectItem>
            {Object.entries(ORSAK).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {counts.inventering_rattat ? (
        <p className="text-sm text-muted-foreground">
          {counts.inventering_rattat} flaggor har en senare inventering eller saldorättning för samma vara och plats. De kvitteras inte automatiskt.
        </p>
      ) : null}
      {q.isLoading && <p className="text-muted-foreground">Laddar…</p>}
      {grouped.map(([store, products]) => (
        <Card key={store}>
          <CardHeader><CardTitle className="text-lg">{store} ({[...products.values()].reduce((a, b) => a + b.length, 0)})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[...products.entries()].map(([prod, list]) => (
              <div key={prod} className="space-y-2">
                <div className="font-medium break-words">{prod} <span className="text-muted-foreground">({list.length})</span></div>
                {list.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-border pb-2">
                    <span className="font-mono tabular-nums">{fmtDate(r.created_at)}</span>
                    <span>{r.movement_type ?? "–"}</span>
                    <span className="font-mono tabular-nums">saldo {kg(r.resulting_qty)} kg</span>
                    <Badge variant={r.sannolik_orsak === "inventering_rattat" ? "secondary" : "outline"}>{ORSAK[r.sannolik_orsak]}</Badge>
                    {r.fix_at && <span className="text-muted-foreground">{r.fix_type} {fmtDate(r.fix_at)}</span>}
                    <div className="flex gap-2 ml-auto">
                      <Select value={reason[r.id] ?? ""} onValueChange={(v) => setReason((s) => ({ ...s, [r.id]: v }))}>
                        <SelectTrigger className="w-52 h-8"><SelectValue placeholder="Välj orsak" /></SelectTrigger>
                        <SelectContent>{ACK_REASONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" disabled={!reason[r.id] || ack.isPending} onClick={() => ack.mutate(r.id)}>Kvittera</Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
