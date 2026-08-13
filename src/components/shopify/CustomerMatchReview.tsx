import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserSearch } from "lucide-react";
import { toast } from "sonner";

/**
 * Granskningsvy för tvetydig kundmatchning.
 *
 * Webhooken kopplar aldrig en webborder tyst till första träffen: när flera
 * kunder matchar samma e-post eller samma telefon + efternamn skapas ordern
 * utan kund och hamnar här. Personalen väljer rätt kund eller lägger upp en ny.
 * Ingen automatisk sammanslagning av befintliga kunder sker någonsin.
 */

const db = supabase as any;

const normEmail = (v: unknown) => (v == null ? null : String(v).trim().toLowerCase() || null);

const normPhone = (v: unknown) => {
  if (v == null) return null;
  let d = String(v).replace(/[^0-9+]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (d.startsWith("46")) d = "+" + d;
    else if (d.startsWith("0")) d = "+46" + d.slice(1);
    else d = "+46" + d;
  }
  d = "+" + d.slice(1).replace(/[^0-9]/g, "");
  return d.length < 8 ? null : d;
};

interface ReviewRow {
  eventId: string;
  message: string;
  order: any;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  shopifyCustomerId: string | null;
  candidates: any[];
}


export default function CustomerMatchReview() {
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, { first: string; last: string }>>({});


  const review = useQuery({
    queryKey: ["shopify_customer_review"],
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await db
        .from("shopify_webhook_events")
        .select("id, error, payload, customer_order_id")
        .eq("status", "skapad")
        .is("resolved_by", null)
        .not("error", "is", null)
        .order("received_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      const rows = ((data || []) as any[]).filter((e) =>
        String(e.error ?? "").startsWith("Tvetydig kundmatchning"),
      );
      const out: ReviewRow[] = [];

      for (const ev of rows) {
        if (!ev.customer_order_id) continue;
        const { data: order } = await db
          .from("customer_orders")
          .select(
            "id, order_number, customer_id, customer_name_snapshot, customer_phone_snapshot, store_id, shopify_order_number, stores(name, legal_entity_id)",
          )
          .eq("id", ev.customer_order_id)
          .maybeSingle();
        if (!order || order.customer_id) continue;

        const c = ev.payload?.customer ?? {};
        const email = normEmail(c.email ?? ev.payload?.email ?? ev.payload?.contact_email);
        const phone = normPhone(c.phone ?? order.customer_phone_snapshot);
        const entity = order.stores?.legal_entity_id ?? null;

        let candidates: any[] = [];
        let q = db
          .from("customers_retail")
          .select("id, name, email, phone, city, created_at, store_id, stores(name)")
          .is("anonymized_at", null)
          .limit(10);
        if (entity) q = q.eq("legal_entity_id", entity);
        if (email) {
          const { data: byEmail } = await q.eq("email_normalized", email);
          candidates = byEmail || [];
        }
        if (!candidates.length && phone) {
          let q2 = db
            .from("customers_retail")
            .select("id, name, email, phone, city, created_at, store_id, stores(name)")
            .is("anonymized_at", null)
            .eq("phone_normalized", phone)
            .limit(10);
          if (entity) q2 = q2.eq("legal_entity_id", entity);
          const { data: byPhone } = await q2;
          candidates = byPhone || [];
        }

        const ship = ev.payload?.shipping_address ?? ev.payload?.billing_address ?? {};
        out.push({
          eventId: ev.id,
          message: String(ev.error),
          order,
          email,
          phone,
          firstName: String(c.first_name ?? ship.first_name ?? "").trim() || null,
          lastName: String(c.last_name ?? ship.last_name ?? "").trim() || null,
          shopifyCustomerId: c?.id != null ? String(c.id) : null,
          candidates,
        });

      }
      return out;
    },
    refetchInterval: 60000,
  });

  const finish = async (eventId: string) => {
    const { data: me } = await supabase.auth.getUser();
    await db
      .from("shopify_webhook_events")
      .update({ error: null, resolved_by: me?.user?.id ?? null })
      .eq("id", eventId);
    await review.refetch();
  };

  const attach = async (row: ReviewRow, customerId: string) => {
    setBusy(row.eventId);
    try {
      const patch: Record<string, unknown> = { customer_id: customerId };
      await db.from("customer_orders").update(patch).eq("id", row.order.id);
      if (row.shopifyCustomerId) {
        const { data: cust } = await db
          .from("customers_retail")
          .select("shopify_customer_id")
          .eq("id", customerId)
          .maybeSingle();
        if (!cust?.shopify_customer_id) {
          await db
            .from("customers_retail")
            .update({ shopify_customer_id: row.shopifyCustomerId })
            .eq("id", customerId);
        }
      }
      await db.from("customer_order_events").insert({
        customer_order_id: row.order.id,
        event_type: "kund_granskad",
        description: "Tvetydig kundmatchning granskad — ordern kopplades manuellt till kund.",
      });
      await finish(row.eventId);
      toast.success("Ordern kopplades till kunden");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kopplingen misslyckades");
    } finally {
      setBusy(null);
    }
  };

  /** Nyregistrering kräver förnamn och efternamn. */
  const createNew = async (row: ReviewRow) => {
    const snap = String(row.order.customer_name_snapshot ?? "").trim();
    const first = names[row.eventId]?.first ?? row.firstName ?? snap.replace(/\s+\S+$/, "").trim();
    const last = names[row.eventId]?.last ?? row.lastName ?? (/\s/.test(snap) ? snap.replace(/^.*\s+/, "") : "");
    if (!first.trim() || !last.trim()) {
      toast.error("Ange både förnamn och efternamn innan kunden skapas.");
      setNames((s) => ({ ...s, [row.eventId]: { first, last } }));
      return;
    }
    setBusy(row.eventId);
    try {
      const { data: created, error } = await db
        .from("customers_retail")
        .insert({
          store_id: row.order.store_id,
          name: `${first.trim()} ${last.trim()}`,
          first_name: first.trim(),
          last_name: last.trim(),
          phone: row.order.customer_phone_snapshot,
          email: row.email,
          shopify_customer_id: row.shopifyCustomerId,
          source: "shopify",
        })
        .select("id")
        .single();
      if (error) throw error;
      await db.from("customer_orders").update({ customer_id: created.id }).eq("id", row.order.id);
      await finish(row.eventId);
      toast.success("Ny kund skapad och kopplad");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunden kunde inte skapas");
    } finally {
      setBusy(null);
    }
  };


  const rows = review.data || [];

  return (
    <Card className={rows.length ? "border-amber-500/60" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserSearch className="h-4 w-4" /> Kundmatchning att granska
          <Badge variant={rows.length ? "destructive" : "secondary"} className="ml-auto">
            {rows.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!rows.length && (
          <p className="text-xs text-muted-foreground">
            Inga tvetydiga kundmatchningar. Webbordrar kopplas automatiskt på Shopify-kundnummer,
            e-post eller telefon + efternamn inom bolaget.
          </p>
        )}
        {rows.map((row) => (
          <div key={row.eventId} className="space-y-2 rounded-md border border-grid-line p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono tabular-nums">{row.order.order_number}</span>
              <Badge variant="outline">{row.order.shopify_order_number ?? "Webborder"}</Badge>
              <span className="text-muted-foreground">{row.order.stores?.name}</span>
              <span className="font-semibold">{row.order.customer_name_snapshot}</span>
              <span className="font-mono text-muted-foreground">
                {row.email ?? ""} {row.phone ?? ""}
              </span>
            </div>
            <p className="text-xs text-amber-600">{row.message}</p>
            <ul className="space-y-1">
              {row.candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {c.name} · <span className="font-mono">{c.phone ?? "—"}</span> ·{" "}
                    {c.email ?? "—"} · {c.stores?.name ?? "—"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 text-xs"
                    disabled={busy === row.eventId}
                    onClick={() => attach(row, c.id)}
                  >
                    Koppla
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-7 w-32 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="Förnamn"
                value={names[row.eventId]?.first ?? row.firstName ?? ""}
                onChange={(e) =>
                  setNames((s) => ({
                    ...s,
                    [row.eventId]: {
                      first: e.target.value,
                      last: s[row.eventId]?.last ?? row.lastName ?? "",
                    },
                  }))
                }
              />
              <input
                className="h-7 w-32 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="Efternamn"
                value={names[row.eventId]?.last ?? row.lastName ?? ""}
                onChange={(e) =>
                  setNames((s) => ({
                    ...s,
                    [row.eventId]: {
                      first: s[row.eventId]?.first ?? row.firstName ?? "",
                      last: e.target.value,
                    },
                  }))
                }
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-xs"
                disabled={busy === row.eventId}
                onClick={() => createNew(row)}
              >
                Ingen av dessa — skapa ny kund
              </Button>
            </div>

          </div>
        ))}
      </CardContent>
    </Card>
  );
}
