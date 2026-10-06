import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Row = {
  id: string; created_at: string; kalla: string | null; action: string | null; kall_id: string | null;
  butik: string | null; av: string | null; data_sammanfattning: string | null;
  result: string; error: string | null; duration_ms: number | null;
};

const KALLOR = ["n8n", "formular", "telegram", "annat"];
const RESULTAT = ["ok", "granskning", "fel", "dubblett"];
const tone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ok: "default", granskning: "secondary", fel: "destructive", dubblett: "outline",
};
const fmt = (s: string) =>
  new Date(s).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "medium" });

export default function IntegrationLog() {
  const [kalla, setKalla] = useState("alla");
  const [result, setResult] = useState("alla");
  const { data, isLoading, error } = useQuery({
    queryKey: ["integration_log", kalla, result],
    queryFn: async () => {
      let q = supabase.from("integration_log").select("*").order("created_at", { ascending: false }).limit(200);
      if (kalla !== "alla") q = q.eq("kalla", kalla);
      if (result !== "alla") q = q.eq("result", result);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Integrationslogg</h1>
        <p className="text-sm text-muted-foreground">Alla anrop genom dörren för externa kopplingar. Senaste 200.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={kalla} onValueChange={setKalla}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla källor</SelectItem>
            {KALLOR.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla resultat</SelectItem>
            {RESULTAT.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {error && <p className="text-sm text-destructive">Kunde inte läsa loggen.</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Inga anrop ännu.</p>}
      <div className="space-y-2">
        {data?.map((r) => (
          <Card key={r.id}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Badge variant={tone[r.result] ?? "outline"}>{r.result}</Badge>
                <span>{r.action ?? "okänd"}</span>
                <span className="text-muted-foreground">{r.kalla ?? "ingen källa"}</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{fmt(r.created_at)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 break-words p-3 pt-0 text-sm">
              <div className="text-muted-foreground">
                {[r.butik && `Butik: ${r.butik}`, r.av && `Av: ${r.av}`, r.kall_id && `Id: ${r.kall_id}`,
                  r.duration_ms != null && `${r.duration_ms} ms`].filter(Boolean).join(" · ")}
              </div>
              {r.data_sammanfattning && <div>{r.data_sammanfattning}</div>}
              {r.error && <div className="text-destructive">{r.error}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
