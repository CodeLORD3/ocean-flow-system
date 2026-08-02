import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface RejectedRow {
  line?: number;
  sku?: string;
  name?: string;
  errors?: string[];
}

interface ImportLog {
  id: string;
  created_at: string;
  description: string;
  details: {
    inserted?: number;
    updated?: number;
    skipped?: number;
    rejected_total?: number;
    rejected?: RejectedRow[];
    file?: string | null;
  } | null;
}

const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;

function downloadRejected(log: ImportLog) {
  const rows = log.details?.rejected ?? [];
  const header = ["rad", "sku", "name", "fel"];
  const body = rows.map((r) =>
    [String(r.line ?? ""), r.sku ?? "", r.name ?? "", (r.errors ?? []).join("; ")]
      .map(csvEscape)
      .join(","),
  );
  const blob = new Blob(["\uFEFF" + [header.join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avvisade_rader_${log.created_at.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportHistory() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["product-import-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, created_at, description, details")
        .eq("action_type", "product_import")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as ImportLog[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Läser importhistorik…
      </div>
    );
  }

  if (logs.length === 0) return null;

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <History className="h-3 w-3" /> Senaste importer
      </div>
      <div className="max-h-56 overflow-auto">
        {logs.map((log) => {
          const rejectedTotal = log.details?.rejected_total ?? log.details?.skipped ?? 0;
          const rejected = log.details?.rejected ?? [];
          const isOpen = expanded === log.id;
          return (
            <div key={log.id} className="border-b border-border/50 last:border-0">
              <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[11px]">
                <span className="font-mono tabular-nums text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("sv-SE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <span>{log.details?.file ?? "fil"}</span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                  {log.details?.inserted ?? 0} nya
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                  {log.details?.updated ?? 0} uppdaterade
                </Badge>
                {rejectedTotal > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {rejectedTotal} avvisade
                  </Badge>
                )}
                {rejected.length > 0 && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[11px]"
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Visa fel
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[11px]"
                      onClick={() => downloadRejected(log)}
                    >
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                )}
                {rejected.length === 0 && rejectedTotal > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Feldetaljer sparades inte för denna körning
                  </span>
                )}
              </div>
              {isOpen && rejected.length > 0 && (
                <table className="w-full border-t border-border/50 text-[11px]">
                  <tbody>
                    {rejected.map((r, i) => (
                      <tr key={`${r.sku}-${i}`} className="border-b border-border/30 last:border-0 align-top">
                        <td className="w-10 px-2 py-1 font-mono tabular-nums text-muted-foreground">{r.line}</td>
                        <td className="w-28 px-2 py-1 font-mono">{r.sku}</td>
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1 text-destructive">{(r.errors ?? []).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
