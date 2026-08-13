import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

/**
 * Kundpar som ser ut som dubbletter inom samma bolag: samma e-post, eller
 * samma normaliserade telefon och samma efternamn. Listan är endast
 * beslutsunderlag — ingen automatisk sammanslagning sker.
 */

const db = supabase as any;

export default function RetailCustomerDuplicates() {
  const dupes = useQuery({
    queryKey: ["retail_customer_duplicates"],
    queryFn: async () => {
      const { data, error } = await db
        .from("retail_customer_duplicates")
        .select("*")
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const rows = dupes.data || [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Möjliga dubblettkunder
          <Badge variant={rows.length ? "outline" : "secondary"} className="ml-auto">
            {rows.length} par
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        {!rows.length && (
          <p className="text-muted-foreground">
            Inga dubblettkandidater i kundregistret.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={`${r.customer_a}-${r.customer_b}`}
            className="flex flex-wrap items-center gap-2 border-b border-grid-line/60 py-1 last:border-0"
          >
            <Badge variant="outline" className="shrink-0">
              {r.match_reason}
            </Badge>
            <span className="min-w-0 flex-1 truncate">
              {r.name_a} · <span className="font-mono">{r.phone_a ?? "—"}</span> · {r.email_a ?? "—"}
            </span>
            <span className="text-muted-foreground">↔</span>
            <span className="min-w-0 flex-1 truncate">
              {r.name_b} · <span className="font-mono">{r.phone_b ?? "—"}</span> · {r.email_b ?? "—"}
            </span>
          </div>
        ))}
        {!!rows.length && (
          <p className="pt-1 text-muted-foreground">
            Sammanslagning görs manuellt — systemet slår aldrig ihop kunder automatiskt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
