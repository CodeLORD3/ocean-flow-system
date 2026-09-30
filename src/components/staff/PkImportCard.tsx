import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IndustryRow, SectionLabel, DecisionBar, DecisionMetric } from "@/components/industry";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type Row = { status: string; hours: number | null; moved_from_admin: boolean; store_id: string | null };

const fmtH = (h: number) => h.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Status för den tillfälliga importen av Personalkollen-pass till egna tidsposter. */
export function PkImportCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["pk-import-status"],
    queryFn: async () => {
      const [imp, stores, setting] = await Promise.all([
        supabase.from("pk_time_imports" as never).select("status, hours, moved_from_admin, store_id"),
        supabase.from("stores").select("id, name"),
        supabase.from("system_settings").select("value").eq("key", "pk_import_enabled").maybeSingle(),
      ]);
      if (imp.error) throw imp.error;
      return {
        rows: (imp.data ?? []) as unknown as Row[],
        names: new Map(((stores.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])),
        enabled: (setting.data as { value: unknown } | null)?.value !== false,
      };
    },
  });
  const rows = data?.rows ?? [];
  const imported = rows.filter((r) => r.status === "importerad");
  const perStore = new Map<string, { n: number; h: number }>();
  for (const r of imported) {
    const k = r.store_id ?? "";
    const cur = perStore.get(k) ?? { n: 0, h: 0 };
    perStore.set(k, { n: cur.n + 1, h: cur.h + Number(r.hours ?? 0) });
  }

  const toggle = async (on: boolean) => {
    const { error } = await supabase.from("system_settings").update({ value: on } as never).eq("key", "pk_import_enabled");
    if (error) toast({ title: "Kunde inte ändra", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["pk-import-status"] });
  };

  if (!data) return null;
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <SectionLabel>HR-kontroll</SectionLabel>
          <h2 className="ind-h1 text-lg">Import från Personalkollen (tillfällig)</h2>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Import på <Switch checked={data.enabled} onCheckedChange={toggle} />
        </label>
      </div>
      <DecisionBar>
        <DecisionMetric label="Importerade pass" value={String(imported.length)} />
        <DecisionMetric label="Timmar" value={fmtH(imported.reduce((s, r) => s + Number(r.hours ?? 0), 0))} />
        <DecisionMetric label="Matchade mot egen stämpling" value={String(rows.filter((r) => r.status === "matchad_egen").length)} />
        <DecisionMetric label="Ej kopplade" value={String(rows.filter((r) => r.status === "ej_kopplad" || r.status === "ej_mappad").length)} tone={rows.some((r) => r.status === "ej_kopplad") ? "progress" : "ok"} />
        <DecisionMetric label="Fel" value={String(rows.filter((r) => r.status === "fel").length)} tone={rows.some((r) => r.status === "fel") ? "alert" : "ok"} />
      </DecisionBar>
      {[...perStore.entries()].sort((a, b) => b[1].h - a[1].h).map(([id, v]) => (
        <IndustryRow key={id} className="flex-wrap gap-3">
          <span className="min-w-[200px]">{data.names.get(id) ?? "Okänd butik"}</span>
          <span className="ind-mono text-sm tabular-nums">{v.n} pass · {fmtH(v.h)} h</span>
        </IndustryRow>
      ))}
    </section>
  );
}
