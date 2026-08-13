import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Globe, Inbox, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { suggestProducts, type MatchProduct } from "@/lib/foljesedelMatch";
import { EmptyState } from "@/components/EmptyState";
import CustomerMatchReview from "@/components/shopify/CustomerMatchReview";
import RetailCustomerDuplicates from "@/components/shopify/RetailCustomerDuplicates";

/**
 * Webbordrar (Shopify).
 *
 * Här sköts butiksmappningen för Shopifys nycklar, inkorgen för osorterade
 * webbordrar och granskningen av rader som inte kunde matchas mot produkt.
 */

const db = supabase as any;

const KEY_TYPES: { value: string; label: string }[] = [
  { value: "shopifyLocationId", label: "shopifyLocationId (primär)" },
  { value: "locationId", label: "locationId (fallback)" },
  { value: "deliveryLocation", label: "Delivery Location, adresstext" },
];

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/shopify-order-webhook`;

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function ShopifyWebOrders() {
  const qc = useQueryClient();
  const [newRow, setNewRow] = useState({
    key_type: "shopifyLocationId",
    key_value: "",
    store_id: "",
    label: "",
  });
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});

  const stores = useQuery({
    queryKey: ["stores_for_shopify"],
    queryFn: async () => {
      const { data, error } = await db.from("stores").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const mappings = useQuery({
    queryKey: ["shopify_store_map"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_store_map")
        .select("*, stores(name)")
        .order("key_type")
        .order("key_value");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const events = useQuery({
    queryKey: ["shopify_webhook_events"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shopify_webhook_events")
        .select("*, stores(name)")
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  const unmatched = useQuery({
    queryKey: ["shopify_unmatched_lines"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_order_lines")
        .select(
          "id, shopify_sku, shopify_title, free_text_name, quantity_ordered, unit, created_at, customer_orders!inner(id, order_number, store_id, created_at, stores(name))",
        )
        .eq("needs_product_match", true)
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 60000,
  });

  const products = useQuery({
    queryKey: ["products_for_shopify_match"],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, name, sku, unit, latin_name, species_group, purchasable, active")
        .eq("active", true)
        .limit(5000);
      if (error) throw error;
      return (data || []) as MatchProduct[];
    },
  });

  const saveMapping = useMutation({
    mutationFn: async (row: any) => {
      const { error } = row.id
        ? await db.from("shopify_store_map").update(row).eq("id", row.id)
        : await db.from("shopify_store_map").insert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopify_store_map"] });
      toast.success("Mappningen är sparad.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("shopify_store_map").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopify_store_map"] });
      toast.success("Mappningen är borttagen.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignStore = useMutation({
    mutationFn: async ({ eventId, storeId }: { eventId: string; storeId: string }) => {
      const { data, error } = await supabase.functions.invoke("shopify-order-webhook/assign", {
        body: { event_id: eventId, store_id: storeId },
      });
      if (error) throw new Error(error.message);
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Ordern kunde inte skapas");
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`Kundorder ${data.orderNumber} skapad.`);
      qc.invalidateQueries({ queryKey: ["shopify_webhook_events"] });
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["shopify_unmatched_lines"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmMatch = useMutation({
    mutationFn: async ({ line, productId }: { line: any; productId: string }) => {
      const product = (products.data || []).find((p) => p.id === productId);
      const { error } = await db
        .from("customer_order_lines")
        .update({
          product_id: productId,
          is_free_text: false,
          free_text_name: null,
          needs_product_match: false,
          unit: String(product?.unit ?? "").toLowerCase() === "st" ? "st" : "kg",
        })
        .eq("id", line.id);
      if (error) throw new Error(error.message);
      if (line.shopify_sku) {
        const { error: mapErr } = await db.from("shopify_product_map").upsert(
          {
            shopify_sku: line.shopify_sku,
            shopify_title: line.shopify_title,
            product_id: productId,
            confirmed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          },
          { onConflict: "shopify_sku" },
        );
        if (mapErr) throw new Error(mapErr.message);
      }
    },
    onSuccess: () => {
      toast.success("Raden är kopplad och valet sparat för kommande ordrar.");
      qc.invalidateQueries({ queryKey: ["shopify_unmatched_lines"] });
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unsorted = useMemo(
    () => (events.data || []).filter((e) => e.status === "osorterad"),
    [events.data],
  );
  const failures = useMemo(
    () => (events.data || []).filter((e) => e.status === "fel" || e.status === "ogiltig_hmac"),
    [events.data],
  );

  const suggestionsFor = (line: any) => {
    if (!products.data?.length) return [];
    return suggestProducts(
      { product_name: line.shopify_title ?? line.free_text_name, supplier_article_no: line.shopify_sku },
      { products: products.data },
      5,
    );
  };

  const attrOf = (payload: any, key: string) => {
    const list = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
    const hit = list.find((a: any) => String(a?.key ?? "").toLowerCase() === key.toLowerCase());
    return hit?.value != null ? String(hit.value) : "—";
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Globe className="h-4 w-4" /> Webbordrar (Shopify)
          </h1>
          <p className="text-xs text-muted-foreground">
            Ordrar från webben landar direkt i rätt butiks kundordervy, förskottsbetalda med låsta
            radpriser. Ingen order kastas — kan butiken inte avgöras hamnar ordern i inkorgen nedan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(WEBHOOK_URL);
            toast.success("Webhook-URL kopierad.");
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> Kopiera webhook-URL
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <CustomerMatchReview />
        <RetailCustomerDuplicates />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Webhook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="break-all rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs">
              {WEBHOOK_URL}
            </div>
            <p className="text-xs text-muted-foreground">
              Ämne <span className="font-mono">orders/create</span>, format JSON (REST). Signaturen
              kontrolleras mot signeringsnyckeln i systemets hemligheter.
            </p>
          </CardContent>
        </Card>

        <Card className={unsorted.length ? "border-amber-500/60" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4" /> Osorterade webbordrar
              {unsorted.length > 0 && <Badge variant="destructive">{unsorted.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {events.isLoading ? (
              <p className="text-muted-foreground">Läser inkorgen…</p>
            ) : unsorted.length === 0 ? (
              <p className="text-muted-foreground">Inga osorterade ordrar — allt landade rätt.</p>
            ) : (
              unsorted.map((e) => (
                <div key={e.id} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{e.shopify_order_number}</span>
                    <span className="text-xs text-muted-foreground">{fmtTime(e.received_at)}</span>
                    <span className="text-xs text-muted-foreground">
                      Leveransplats: {attrOf(e.payload, "Delivery Location")} · shopifyLocationId:{" "}
                      {attrOf(e.payload, "shopifyLocationId")} · locationId:{" "}
                      {attrOf(e.payload, "locationId")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Select
                      value={assign[e.id] ?? ""}
                      onValueChange={(v) => setAssign({ ...assign, [e.id]: v })}
                    >
                      <SelectTrigger className="h-8 w-56 text-xs">
                        <SelectValue placeholder="Välj butik" />
                      </SelectTrigger>
                      <SelectContent>
                        {(stores.data || []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!assign[e.id] || assignStore.isPending}
                      onClick={() => assignStore.mutate({ eventId: e.id, storeId: assign[e.id] })}
                    >
                      {assignStore.isPending ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Link2 className="mr-2 h-3 w-3" />
                      )}
                      Skapa kundorder
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={(unmatched.data?.length ?? 0) > 0 ? "border-amber-500/60" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Rader som behöver produktmatchning
              {(unmatched.data?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unmatched.data!.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {unmatched.isLoading ? (
              <p className="text-muted-foreground">Läser rader…</p>
            ) : (unmatched.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">Alla webbrader är kopplade till produkt.</p>
            ) : (
              unmatched.data!.map((l) => {
                const sugg = suggestionsFor(l);
                const ageH =
                  (Date.now() - new Date(l.customer_orders?.created_at ?? Date.now()).getTime()) /
                  3600000;
                return (
                  <div
                    key={l.id}
                    className={`rounded-md border p-2 ${ageH > 2 ? "border-destructive/60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{l.shopify_title ?? l.free_text_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        SKU {l.shopify_sku ?? "—"}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        {Number(l.quantity_ordered)} {l.unit}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.customer_orders?.order_number} · {l.customer_orders?.stores?.name}
                      </span>
                      {ageH > 2 && <Badge variant="destructive">Äldre än 2 timmar</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Select
                        value={picked[l.id] ?? sugg[0]?.product.id ?? ""}
                        onValueChange={(v) => setPicked({ ...picked, [l.id]: v })}
                      >
                        <SelectTrigger className="h-8 w-80 text-xs">
                          <SelectValue placeholder="Välj produkt" />
                        </SelectTrigger>
                        <SelectContent>
                          {sugg.map((s) => (
                            <SelectItem key={s.product.id} value={s.product.id}>
                              {s.product.name} ({s.product.sku}) · {s.score}
                            </SelectItem>
                          ))}
                          {(products.data || [])
                            .filter((p) => !sugg.some((s) => s.product.id === p.id))
                            .slice(0, 300)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} ({p.sku})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={confirmMatch.isPending}
                        onClick={() =>
                          confirmMatch.mutate({
                            line: l,
                            productId: picked[l.id] ?? sugg[0]?.product.id ?? "",
                          })
                        }
                      >
                        Bekräfta koppling
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Butiksmappning</CardTitle>
            <p className="text-xs text-muted-foreground">
              Nycklarna läses i tur och ordning: shopifyLocationId, locationId, därefter adresstext.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1">Nyckeltyp</th>
                    <th className="px-2 py-1">Värde</th>
                    <th className="px-2 py-1">Butik</th>
                    <th className="px-2 py-1">Etikett</th>
                    <th className="px-2 py-1">Aktiv</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {(mappings.data || []).map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-2 py-1 font-mono">{m.key_type}</td>
                      <td className="px-2 py-1 font-mono">{m.key_value}</td>
                      <td className="px-2 py-1">
                        <Select
                          value={m.store_id}
                          onValueChange={(v) => saveMapping.mutate({ id: m.id, store_id: v })}
                        >
                          <SelectTrigger className="h-7 w-48 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(stores.data || []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">{m.label ?? "—"}</td>
                      <td className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => saveMapping.mutate({ id: m.id, active: !m.active })}
                        >
                          {m.active ? "Ja" : "Nej"}
                        </Button>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => deleteMapping.mutate(m.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">Nyckeltyp</Label>
                <Select
                  value={newRow.key_type}
                  onValueChange={(v) => setNewRow({ ...newRow, key_type: v })}
                >
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEY_TYPES.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">Värde</Label>
                <Input
                  className="h-8 w-40 font-mono text-xs"
                  value={newRow.key_value}
                  onChange={(e) => setNewRow({ ...newRow, key_value: e.target.value })}
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">Butik</Label>
                <Select
                  value={newRow.store_id}
                  onValueChange={(v) => setNewRow({ ...newRow, store_id: v })}
                >
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder="Välj butik" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stores.data || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">Etikett</Label>
                <Input
                  className="h-8 w-40 text-xs"
                  value={newRow.label}
                  onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                disabled={!newRow.key_value || !newRow.store_id}
                onClick={() =>
                  saveMapping.mutate(
                    { ...newRow, label: newRow.label || null },
                    { onSuccess: () => setNewRow({ ...newRow, key_value: "", label: "" }) },
                  )
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Lägg till
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={failures.length ? "border-destructive" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Senaste webhookhändelser</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(events.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="Inga webhookhändelser ännu"
                description="Så snart Shopify skickar en order visas den här."
              />
            ) : (
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-2 py-1">Tid</th>
                      <th className="px-2 py-1">Order</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Signatur</th>
                      <th className="px-2 py-1">Butik</th>
                      <th className="px-2 py-1">Fel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events.data || []).map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-2 py-1 font-mono">{fmtTime(e.received_at)}</td>
                        <td className="px-2 py-1 font-mono">{e.shopify_order_number ?? "—"}</td>
                        <td className="px-2 py-1">
                          <Badge
                            variant={
                              e.status === "skapad"
                                ? "secondary"
                                : e.status === "duplikat"
                                  ? "outline"
                                  : "destructive"
                            }
                          >
                            {e.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-1">{e.hmac_valid ? "Giltig" : "Ogiltig"}</td>
                        <td className="px-2 py-1">{e.stores?.name ?? "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground">{e.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
