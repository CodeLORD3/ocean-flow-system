import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

/**
 * Registreringsdokument för levande blötdjur som gått ut eller går ut inom
 * 14 dagar. Ett utgånget dokument spärrar partiet i databasen.
 */
export default function BivalveDueList() {
  const { data: lots = [] } = useQuery({
    queryKey: ["bivalve_docs_due"],
    queryFn: async () => {
      const limit = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, species_name, bivalve_doc_number, bivalve_doc_valid_to, production_area_classification",
        )
        .eq("is_bivalve", true)
        .not("bivalve_doc_valid_to", "is", null)
        .lte("bivalve_doc_valid_to", limit)
        .order("bivalve_doc_valid_to", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (!lots.length) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-1 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Shell className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Registreringsdokument, levande blötdjur</span>
      </div>
      {lots.map((l) => {
        const expired = l.bivalve_doc_valid_to < today;
        return (
          <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono">{l.lot_number}</span>
            <span className="flex-1 truncate">{l.species_name}</span>
            <span className="text-muted-foreground">
              Klass {l.production_area_classification || "—"}
            </span>
            <Badge variant={expired ? "destructive" : "outline"} className="gap-1 text-[10px]">
              {expired && <AlertTriangle className="h-3 w-3" />}
              {expired ? "Utgånget " : "Giltigt till "}
              {l.bivalve_doc_valid_to}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
