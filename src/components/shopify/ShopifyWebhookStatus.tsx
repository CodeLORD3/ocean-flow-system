import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, DownloadCloud, Globe, Link2, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Webbordrarnas hälsa på Systemstatus: misslyckad bearbetning av köade ordrar
 * (med möjlighet att köra om raden), ogiltiga signaturer, osorterade ordrar,
 * omatchade rader äldre än två timmar samt vakthunden som larmar om ingen
 * webhook tagits emot på 24 timmar — det kan betyda att Shopify raderat
 * prenumerationen.
 */

const db = supabase as any;
const TWO_HOURS = 2 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

const hoursSince = (v?: string | null) =>
  v ? Math.floor((Date.now() - new Date(v).getTime()) / 3600000) : null;

export default function ShopifyWebhookStatus() {
  const [busy, setBusy] = useState<string | null>(null);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);


  const events = useQuery({
    queryKey: ["shopify_status_events"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_webhook_events")
        .select("id, status, error, shopify_order_number, received_at, hmac_valid, attempts, customer_order_id, shop_domain")
        .in("status", ["fel", "koad", "bearbetar", "ogiltig_hmac", "osorterad", "avbokad_larm", "okand_topic"])
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  /** Webbutikerna: en rad per Shopify-konto (Sverige, Schweiz, ...). */
  const shops = useQuery({
    queryKey: ["shopify_shops"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_shops")
        .select("id, shop_domain, label, currency, last_webhook_at, active")
        .eq("active", true)
        .order("label");
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  /** Vakthund: senaste mottagna webhook oavsett utfall. */
  const lastReceived = useQuery({
    queryKey: ["shopify_status_last_received"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_webhook_events")
        .select("received_at")
        .order("received_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data || [])[0]?.received_at ?? null) as string | null;
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

  const reprocess = async (id: string) => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-order-webhook/reprocess", {
        body: { event_id: id },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok) toast.success("Raden bearbetades om");
      else toast.error(res?.error ?? "Bearbetningen misslyckades igen");
      await events.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Omkörningen misslyckades");
    } finally {
      setBusy(null);
    }
  };

  /** Backfyllnad: hämtar öppna betalda ordrar från Shopify in i webhook-kön. */
  const backfill = async (shopDomain?: string) => {
    setBusy(`backfill:${shopDomain ?? "alla"}`);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-backfill", {
        body: shopDomain ? { shop: shopDomain } : {},
      });
      if (error) throw error;
      const r = data as any;
      if (r?.ok === false) {
        toast.error(r?.error ?? "Backfyllnaden misslyckades");
      } else {
        toast.success(
          `Hämtade ${r?.fetched ?? 0} · köade ${r?.queued ?? 0} · duplikat ${r?.duplicates ?? 0} · osorterade ${r?.unsorted ?? 0} · fel ${r?.errors ?? 0}`,
        );
      }
      if (Array.isArray(r?.messages)) {
        for (const m of r.messages.slice(0, 5)) toast.warning(String(m));
      }
      await Promise.all([events.refetch(), lastReceived.refetch(), shops.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfyllnaden misslyckades");
    } finally {
      setBusy(null);
    }
  };

  /** OAuth-status: finns en giltig Admin-token för butiken? */
  const oauth = useQuery({
    queryKey: ["shopify-oauth-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("shopify-oauth/status");
      if (error) throw error;
      return data as any;
    },
    retry: false,
  });

  /**
   * Startar OAuth: hämtar authorize-URL. Shopify vägrar visas i en iframe
   * (ERR_BLOCKED_BY_RESPONSE), så URL:en visas även som länk att öppna i en
   * riktig flik om popup-fönstret blockeras av förhandsvisningen.
   */
  const connect = async () => {
    setBusy("oauth");
    try {
      const { data, error } = await supabase.functions.invoke("shopify-oauth/start", { body: {} });
      if (error) throw error;
      const r = data as any;
      if (!r?.authorize_url) throw new Error(r?.error ?? "Kunde inte starta anslutningen");
      setAuthorizeUrl(r.authorize_url as string);
      window.open(r.authorize_url, "_blank", "noopener,noreferrer");
      toast.info("Godkänn appen i Shopify-fliken. Blev fliken blockerad? Använd länken i kortet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte starta anslutningen");
    } finally {
      setBusy(null);
    }
  };



  const rows = events.data || [];
  const failed = rows.filter((e) => e.status === "fel");
  const queued = rows.filter((e) => e.status === "koad" || e.status === "bearbetar");
  const badHmac = rows.filter((e) => e.status === "ogiltig_hmac");
  const unsorted = rows.filter((e) => e.status === "osorterad");
  const cancelAlarm = rows.filter((e) => e.status === "avbokad_larm");
  const unknownTopic = rows.filter((e) => e.status === "okand_topic");
  const staleLines = stale.data || [];

  const last = lastReceived.data ?? null;
  const silent = !last || Date.now() - new Date(last).getTime() > DAY;
  const silentHours = hoursSince(last);

  const problems =
    failed.length + badHmac.length + unsorted.length + staleLines.length + cancelAlarm.length;
  const alarm = problems > 0 || silent;

  return (
    <Card className={alarm ? "border-destructive" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {alarm ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <Globe className="h-4 w-4" /> Webbordrar från Shopify
          <Button
            variant={oauth.data?.connected ? "ghost" : "default"}
            size="sm"
            className="ml-auto h-6 text-xs"
            disabled={busy === "oauth"}
            onClick={connect}
          >
            <Link2 className={`mr-1 h-3 w-3 ${busy === "oauth" ? "animate-pulse" : ""}`} />
            {oauth.data?.connected ? "Anslut Shopify igen" : "Anslut Shopify"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            disabled={busy?.startsWith("backfill") || oauth.data?.connected === false}
            title={
              oauth.data?.connected === false
                ? "Anslut Shopify först — ingen Admin-token finns för butiken"
                : undefined
            }
            onClick={() => backfill()}
          >
            <DownloadCloud
              className={`mr-1 h-3 w-3 ${busy?.startsWith("backfill") ? "animate-pulse" : ""}`}
            />
            Hämta öppna ordrar från Shopify
          </Button>


          <Button asChild variant="ghost" size="sm" className="h-6 text-xs">
            <Link to="/shopify">Öppna webbordrar</Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {oauth.data && oauth.data.connected === false && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Shopify är inte anslutet ({oauth.data.shop || "ingen butiksdomän"}). Tryck
              “Anslut Shopify” och godkänn i Shopify-fönstret. Godkännandet kräver att denna URL
              ligger under <em>Allowed redirection URL(s)</em> i appen:{" "}
              <code className="font-mono">{oauth.data.redirect_uri}</code>
            </span>
          </div>
        )}

        {authorizeUrl && (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Blev Shopify-fliken blockerad (ERR_BLOCKED_BY_RESPONSE)? Shopify tillåter inte
              godkännande inuti förhandsvisningen — öppna länken i en egen webbläsarflik:{" "}
              <a
                href={authorizeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono underline"
              >
                Godkänn i Shopify
              </a>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(authorizeUrl);
                toast.success("Länken kopierad");
              }}
            >
              Kopiera länk
            </Button>
          </div>
        )}



        {silent && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              Ingen webhook mottagen{" "}
              {last ? `på ${silentHours} timmar (senast ${fmtTime(last)})` : "över huvud taget"}.
              Kontrollera att prenumerationen finns kvar i Shopify — Shopify raderar den om
              URL:en upprepat svarar annat än 200.
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant={failed.length ? "destructive" : "secondary"}>
            {failed.length} misslyckad bearbetning
          </Badge>
          <Badge variant={queued.length ? "outline" : "secondary"}>{queued.length} i kö</Badge>
          <Badge variant={badHmac.length ? "destructive" : "secondary"}>
            {badHmac.length} ogiltiga signaturer
          </Badge>
          <Badge variant={unsorted.length ? "destructive" : "secondary"}>
            {unsorted.length} osorterade ordrar
          </Badge>
          <Badge variant={staleLines.length ? "destructive" : "secondary"}>
            {staleLines.length} omatchade rader äldre än 2 h
          </Badge>
          <Badge variant={cancelAlarm.length ? "destructive" : "secondary"}>
            {cancelAlarm.length} avbokade efter packning
          </Badge>
          <Badge variant="secondary" className="font-mono tabular-nums">
            senast {fmtTime(last)}
          </Badge>
        </div>

        {(failed.length > 0 || queued.length > 0) && (
          <ul className="space-y-1 text-xs">
            {[...failed, ...queued].slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center gap-2 font-mono">
                <span className="flex-1 truncate text-muted-foreground">
                  {fmtTime(e.received_at)} · {e.shopify_order_number ?? "—"} · {e.status}
                  {e.attempts ? ` · försök ${e.attempts}` : ""}
                  {e.error ? ` · ${e.error}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 text-xs"
                  disabled={busy === e.id}
                  onClick={() => reprocess(e.id)}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${busy === e.id ? "animate-spin" : ""}`} />
                  Kör om
                </Button>
              </li>
            ))}
          </ul>
        )}

        {cancelAlarm.length > 0 && (
          <ul className="space-y-1 text-xs">
            {cancelAlarm.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">
                  {e.error ?? `${e.shopify_order_number ?? "Webborder"} avbokad efter packning`}
                </span>
                <Button asChild size="sm" variant="outline" className="h-6 shrink-0 text-xs">
                  <Link to="/customer-orders">Öppna ordern</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(badHmac.length > 0 || unsorted.length > 0 || staleLines.length > 0) && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {[...badHmac, ...unsorted, ...unknownTopic].slice(0, 10).map((e) => (
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
