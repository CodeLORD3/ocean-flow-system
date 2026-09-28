import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fmtDateTime } from "@/hooks/useAiTeam";

const LABELS: Record<string, string> = {
  kundorder_24h: "Kundorder inom 24 h → Driftchef",
  avvikelse: "Ny avvikelse → Kvalitetschef",
  temperaturavvikelse: "Temperaturavvikelse → Kvalitetschef (P1)",
  negativt_lager: "Negativt lager → Systemägare (samlas per timme)",
  stort_inkop: "Inköp över 50 000 kr → Ekonomichef",
  shopify_stor_order: "Shopify-order över 3 000 kr → Kundservice",
};

type Setting = { händelse: string; url: string | null; hemlighet: string | null; aktiv: boolean };
type Log = { id: number; skapad: string; händelse: string; källtabell: string; käll_id: string; ai_uppgift_id: number | null; webhook_status: string | null; fel: string | null };

export function AiTriggerAdmin() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["ai_trigger_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("ai_trigger_settings").select("*").order("händelse");
      if (error) throw error;
      return data as Setting[];
    },
  });
  const log = useQuery({
    queryKey: ["ai_trigger_log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("ai_trigger_log").select("*").order("skapad", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Log[];
    },
  });
  const [rows, setRows] = useState<Setting[]>([]);
  useEffect(() => { if (settings.data) setRows(settings.data); }, [settings.data]);

  const save = async (r: Setting) => {
    if (r.aktiv && !r.url?.trim()) return toast.error("Ange en URL innan webhooken slås på.");
    const { error } = await (supabase as any).from("ai_trigger_settings")
      .update({ url: r.url?.trim() || null, hemlighet: r.hemlighet || null, aktiv: r.aktiv }).eq("händelse", r.händelse);
    if (error) return toast.error(error.message);
    toast.success("Sparat");
    qc.invalidateQueries({ queryKey: ["ai_trigger_settings"] });
  };
  const set = (i: number, p: Partial<Setting>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <section className="space-y-4 rounded-lg border p-3">
      <h2 className="font-semibold">Händelsetriggers och webhook</h2>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.händelse} className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto_auto] items-center">
            <span className="text-sm">{LABELS[r.händelse] ?? r.händelse}</span>
            <Input placeholder="Webhook-URL" value={r.url ?? ""} onChange={(e) => set(i, { url: e.target.value })} />
            <Input type="password" placeholder="HMAC-hemlighet" value={r.hemlighet ?? ""} onChange={(e) => set(i, { hemlighet: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><Switch checked={r.aktiv} onCheckedChange={(v) => set(i, { aktiv: v })} />Aktiv</label>
            <Button size="sm" variant="outline" onClick={() => save(r)}>Spara</Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Signatur skickas i headern X-Makrill-Signature som sha256=&lt;hex&gt; av JSON-kroppen.</p>
      </div>
      <div className="overflow-x-auto">
        <h3 className="text-sm font-medium mb-1">Senaste 50 triggers</h3>
        {log.data?.length === 0 && <p className="text-xs text-muted-foreground">Inga triggers ännu.</p>}
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left"><tr><th className="p-1">Tid</th><th className="p-1">Händelse</th><th className="p-1">Källa</th><th className="p-1">Uppgift</th><th className="p-1">Webhook</th><th className="p-1">Fel</th></tr></thead>
          <tbody>
            {log.data?.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-1 whitespace-nowrap">{fmtDateTime(l.skapad)}</td>
                <td className="p-1">{l.händelse}</td>
                <td className="p-1 font-mono">{l.källtabell}/{l.käll_id.slice(0, 8)}</td>
                <td className="p-1 font-mono tabular-nums">{l.ai_uppgift_id ?? "–"}</td>
                <td className="p-1">{l.webhook_status ?? "–"}</td>
                <td className="p-1 text-destructive">{l.fel ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
