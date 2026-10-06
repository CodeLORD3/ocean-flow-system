import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VR_STATUS, VoiceAudio, VoiceReport, VoiceReportBody } from "@/components/voice/voiceReport";

const db = supabase as unknown as { from: (t: string) => any };
const ALL = "__alla";
const fmt = (v: string) => new Date(v).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

export default function Rostrapporter() {
  const qc = useQueryClient();
  const [status, setStatus] = useState(ALL);
  const q = useQuery({
    queryKey: ["voice_reports"],
    queryFn: async () => {
      const [r, s, e, st] = await Promise.all([
        db.from("voice_reports").select("*").order("created_at", { ascending: false }).limit(200),
        db.from("stores").select("id, name"),
        db.from("employees").select("id, first_name, last_name"),
        db.from("staff").select("user_id, first_name, last_name").not("user_id", "is", null),
      ]);
      if (r.error) throw r.error;
      return {
        rows: (r.data ?? []) as VoiceReport[],
        stores: new Map<string, string>((s.data ?? []).map((x: any) => [x.id, x.name])),
        emp: new Map<string, string>((e.data ?? []).map((x: any) => [x.id, `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim()])),
        users: new Map<string, string>((st.data ?? []).map((x: any) => [x.user_id, `${x.first_name} ${x.last_name}`])),
      };
    },
    refetchInterval: 20000,
  });
  const rows = (q.data?.rows ?? []).filter((r) => status === ALL || r.status === status);
  const refresh = () => qc.invalidateQueries({ queryKey: ["voice_reports"] });

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Röstrapporter</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Alla statusar</SelectItem>{Object.entries(VR_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {!q.isLoading && !rows.length && <p className="text-sm text-muted-foreground">Inga röstrapporter ännu.</p>}
      {rows.map((r) => (
        <Card key={r.id}><CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{fmt(r.created_at)}</span>
            <span>{r.source === "telegram" ? "Telegram" : "Appen"}</span>
            <span>{(r.store_id && q.data?.stores.get(r.store_id)) || "–"}</span>
            <span>{(r.employee_id && q.data?.emp.get(r.employee_id)) || (r.user_id && q.data?.users.get(r.user_id)) || ""}</span>
          </div>
          {r.audio_path && <VoiceAudio id={r.id} />}
          <VoiceReportBody r={r} onChanged={refresh} />
        </CardContent></Card>
      ))}
    </div>
  );
}
