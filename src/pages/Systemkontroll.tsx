import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Play } from "lucide-react";

interface Check {
  id: number;
  run_at: string;
  check_name: string;
  status: string;
  count: number | null;
  details: unknown;
}

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string) => any };

const fmt = (v: string) => new Date(v).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

function statusVariant(s: string): "default" | "destructive" | "secondary" | "outline" {
  if (s === "fel") return "destructive";
  if (s === "ok") return "secondary";
  return "outline";
}

export default function Systemkontroll() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["system_checks", "latest"],
    queryFn: async () => {
      const { data: last, error: e1 } = await db.from("system_checks").select("run_at").order("run_at", { ascending: false }).limit(1);
      if (e1) throw e1;
      if (!last?.length) return [] as Check[];
      const { data, error } = await db.from("system_checks").select("*").eq("run_at", last[0].run_at).order("check_name");
      if (error) throw error;
      return (data ?? []) as Check[];
    },
  });

  const { data: logout } = useQuery({
    queryKey: ["nightly_logout_runs", "latest"],
    queryFn: async () => {
      const { data, error } = await db.from("nightly_logout_runs").select("*").order("ran_at", { ascending: false }).limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as { ran_at: string; sessions_ended: number; oauth_sessions_kept: number; message: string | null } | null;
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("run_system_checks_now");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Systemkontrollen är körd");
      qc.invalidateQueries({ queryKey: ["system_checks"] });
      qc.invalidateQueries({ queryKey: ["ai_uppgifter"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sorted = [...data].sort((a, b) => (a.status === "fel" ? 0 : 1) - (b.status === "fel" ? 0 : 1) || a.check_name.localeCompare(b.check_name));
  const fel = data.filter((c) => c.status === "fel").length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Systemkontroll</h1>
          <p className="text-sm text-muted-foreground">
            {data[0] ? `Senaste körning ${fmt(data[0].run_at)} · ${fel} fel av ${data.length} kontroller` : "Ingen körning ännu"} · körs varje natt 03:00
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          <Play className="h-4 w-4 mr-1" /> {run.isPending ? "Kör…" : "Kör nu"}
        </Button>
      </div>

      <div className="border rounded-md px-3 py-2 text-sm">
        <span className="font-medium">Nattlig utloggning 03:30</span>
        <span className="text-muted-foreground">
          {logout
            ? ` · senaste ${fmt(logout.ran_at)} · ${logout.sessions_ended} inloggningar avslutade · ${logout.oauth_sessions_kept} agentkopplingar behölls`
            : " · ingen körning ännu"}
        </span>
        {logout?.message && <p className="text-xs text-destructive mt-1">{logout.message}</p>}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <div className="border rounded-md divide-y">
        {sorted.map((c) => {
          const isOpen = !!open[c.check_name];
          const hasDetails = c.details != null && !(Array.isArray(c.details) && c.details.length === 0);
          return (
            <div key={c.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 disabled:cursor-default"
                onClick={() => setOpen((o) => ({ ...o, [c.check_name]: !isOpen }))}
                disabled={!hasDetails}
              >
                {hasDetails ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
                <span className="font-mono text-sm flex-1">{c.check_name}</span>
                <span className="font-mono tabular-nums text-sm w-12 text-right">{c.count ?? 0}</span>
                <Badge variant={statusVariant(c.status)} className="w-20 justify-center">{c.status}</Badge>
              </button>
              {isOpen && hasDetails && (
                <pre className="bg-muted/40 text-xs font-mono p-3 overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(c.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
