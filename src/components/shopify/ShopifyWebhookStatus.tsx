import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Globe } from "lucide-react";

/**
 * Webbordrarnas hälsa på Systemstatus: misslyckade webhooks, ogiltiga
 * signaturer, osorterade ordrar och omatchade rader äldre än två timmar.
 */

const db = supabase as any;
const TWO_HOURS = 2 * 3600 * 1000;

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function ShopifyWebhookStatus() {
  const events = useQuery({
    queryKey: ["shopify_status_events"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_webhook_events")
        .select("id, status, error, shopify_order_number, received_at, hmac_valid")
        .in("status", ["fel", "ogiltig_hmac", "osorterad"])
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  const stale = useQuery({
    queryKey: ["shopify_status_unmatched"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_order_lines")
        .select("id, shopify_sku, shopify_title, customer_orders!inner(order_number, created_at)")
        .eq("needs_product_match", true)
        .limit(200);
      if (error) throw error;
      return ((data || []) as any[]).filter(
        (l) => Date.now() - new Date(l.customer_orders?.created_at ?? Date.now()).getTime() > TWO_HOURS,
      );
    },
    refetchInterval: 60000,
  });

  const failed = (events.data || []).filter((e) => e.status === "fel");
  const badHmac = (events.data || []).filter((e) => e.status === "ogiltig_hmac");
  const unsorted = (events.data || []).filter((e) => e.status === "osorterad");
  const staleLines = stale.data || [];
  const problems = failed.length + badHmac.length + unsorted.length + staleLines.length;

  return (
    <Card className={problems ? "border-destructive" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {problems ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <Globe className="h-4 w-4" /> Webbordrar från Shopify
          <Button asChild variant="ghost" size="sm" className="ml-auto h-6 text-xs">
            <Link to="/shopify">Öppna webbordrar</Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant={failed.length ? "destructive" : "secondary"}>
            {failed.length} misslyckade webhooks
          </Badge>
          <Badge variant={badHmac.length ? "destructive" : "secondary"}>
            {badHmac.length} ogiltiga signaturer
          </Badge>
          <Badge variant={unsorted.length ? "destructive" : "secondary"}>
            {unsorted.length} osorterade ordrar
          </Badge>
          <Badge variant={staleLines.length ? "destructive" : "secondary"}>
            {staleLines.length} omatchade rader äldre än 2 h
          </Badge>
        </div>

        {problems > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {[...failed, ...badHmac, ...unsorted].slice(0, 10).map((e) => (
              <li key={e.id} className="font-mono">
                {fmtTime(e.received_at)} · {e.shopify_order_number ?? "—"} · {e.status}
                {e.error ? ` · ${e.error}` : ""}
              </li>
            ))}
            {staleLines.slice(0, 10).map((l) => (
              <li key={l.id} className="font-mono">
                {l.customer_orders?.order_number} · omatchad rad {l.shopify_sku ?? l.shopify_title}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
