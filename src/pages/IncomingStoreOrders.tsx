import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Package, Send, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAutoSend,
  useConfirmOrder,
  useDispatchOrder,
  useIncomingOrders,
  useInvoiceBasis,
  useSavePicks,
} from "@/hooks/useStoreReplenishment";
import { STATUS_LABEL, SUPPLIER_LABEL } from "@/lib/storeReplenishment";
import { grossistlagerId, tillverkningslagerId } from "@/lib/locations";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/** Partier på leverantörens lager i FEFO-ordning — äldsta bäst före först. */
function useLots(productId: string | null, supplier: "grossist" | "produktion") {
  return useQuery({
    queryKey: ["replenish_lots", productId, supplier],
    enabled: !!productId,
    queryFn: async () => {
      const locationId =
        supplier === "produktion" ? await tillverkningslagerId() : await grossistlagerId();
      const balances = await lotBalancesAtLocation(productId!, locationId);
      const ids = balances.map((b) => b.lotId).filter((id): id is string => !!id);
      const numbers = new Map<string, string>();
      if (ids.length) {
        const { data } = await db.from("lots").select("id, lot_number").in("id", ids);
        for (const l of data || []) numbers.set(l.id, l.lot_number);
      }
      return balances.map((b) => ({
        ...b,
        lotNumber: b.lotId ? numbers.get(b.lotId) ?? "Utan partinummer" : "Utan parti",
      }));
    },
  });
}

/** Plockraden: vägd vikt per parti, FEFO föreslås först. */
function PickRow({
  line,
  supplier,
  disabled,
}: {
  line: any;
  supplier: "grossist" | "produktion";
  disabled: boolean;
}) {
  const lots = useLots(line.product_id, supplier);
  const savePicks = useSavePicks();
  const [values, setValues] = useState<Record<string, string>>({});

  const saved = (line.store_replenishment_picks ?? []) as any[];

  const save = async () => {
    const picks = Object.entries(values)
      .map(([lotId, v]) => ({
        lotId: lotId === "none" ? null : lotId,
        quantity: Number(String(v).replace(",", ".")) || 0,
      }))
      .filter((p) => p.quantity > 0);
    try {
      await savePicks.mutateAsync({ lineId: line.id, picks });
      toast.success("Plocket är sparat");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara plocket.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Plocka partier (äldsta bäst före först)</p>
      <div className="mt-2 space-y-2">
        {(lots.data ?? []).map((lot) => (
          <div key={lot.lotId ?? "none"} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {lot.lotNumber}
              {lot.bestBefore ? ` · bäst före ${lot.bestBefore}` : ""} ·{" "}
              <span className="tabular-nums text-muted-foreground">{lot.quantityKg} kg</span>
            </span>
            <Input
              disabled={disabled}
              value={values[lot.lotId ?? "none"] ?? ""}
              onChange={(e) => setValues({ ...values, [lot.lotId ?? "none"]: e.target.value })}
              placeholder="vägd vikt"
              className="h-9 w-28 text-right tabular-nums"
            />
          </div>
        ))}
        {(lots.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Inget saldo på lagret för den här varan.</p>
        )}
      </div>
      {saved.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Plockat: {saved.map((p) => `${p.quantity} kg`).join(", ")}
        </p>
      )}
      {!disabled && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={save}>
          Spara plocket
        </Button>
      )}
    </div>
  );
}

/**
 * Inkomna beställningar från butikerna. Här bekräftas rader, partier plockas
 * och leveransen skickas. Lagerrörelser skapas först vid avsändning.
 */
export default function IncomingStoreOrders() {
  const orders = useIncomingOrders();
  const basis = useInvoiceBasis();
  const confirm = useConfirmOrder();
  const dispatch = useDispatchOrder();
  const autoSend = useAutoSend();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    autoSend.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const o of orders.data ?? []) {
      const key = `${o.wanted_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders.data]);

  const confirmAll = async (order: any) => {
    const lines = (order.store_replenishment_lines ?? []).map((l: any) => ({
      id: l.id,
      confirmed: l.line_status !== "avvisad",
      quantity: Number(
        (quantities[l.id] ?? String(l.quantity_confirmed ?? l.quantity_ordered)).replace(",", "."),
      ),
    }));
    try {
      await confirm.mutateAsync({ orderId: order.id, lines });
      toast.success("Beställningen är bekräftad");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte bekräfta beställningen.");
    }
  };

  const rejectLine = async (order: any, lineId: string) => {
    const reason = reasons[lineId]?.trim();
    if (!reason) {
      toast.error("Skriv en orsak till avvisningen.");
      return;
    }
    try {
      await confirm.mutateAsync({ orderId: order.id, lines: [{ id: lineId, confirmed: false, reason }] });
      toast.success("Raden är avvisad");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte avvisa raden.");
    }
  };

  const doDispatch = async (orderId: string) => {
    try {
      const res = await dispatch.mutateAsync(orderId);
      toast.success(`Leveransen är skickad — ${res.movements} lagerrörelser`);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte skicka leveransen.");
    }
  };

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Inkomna beställningar</h1>
        <p className="text-muted-foreground">
          Beställningar från butikerna, grupperade per leveransdag. Lagret flyttas när leveransen
          skickas och när butiken tar emot den.
        </p>
      </header>

      <Tabs defaultValue="ordrar">
        <TabsList>
          <TabsTrigger value="ordrar">Beställningar</TabsTrigger>
          <TabsTrigger value="internhandel">Internhandel</TabsTrigger>
        </TabsList>

        <TabsContent value="ordrar" className="space-y-6 pt-4">
          {grouped.length === 0 && (
            <p className="text-muted-foreground">Inga beställningar just nu.</p>
          )}
          {grouped.map(([day, dayOrders]) => (
            <section key={day} className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">Leverans {day}</h2>
              {dayOrders.map((o: any) => (
                <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {o.stores?.name ?? "Butik"} · {o.order_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {SUPPLIER_LABEL[o.supplier as "grossist" | "produktion"]}
                        {o.intercompany ? " · internhandel" : ""}
                        {o.auto_sent ? " · skickad automatiskt" : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{STATUS_LABEL[o.status as keyof typeof STATUS_LABEL]}</Badge>
                  </div>

                  <div className="mt-3 space-y-3">
                    {(o.store_replenishment_lines ?? []).map((l: any) => (
                      <div key={l.id} className="space-y-2 rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {l.products?.name ?? "Vara"}
                          </span>
                          <span className="tabular-nums text-sm text-muted-foreground">
                            önskat {l.quantity_ordered} {l.unit}
                          </span>
                          {o.status === "skickad" && (
                            <Input
                              value={quantities[l.id] ?? String(l.quantity_ordered)}
                              onChange={(e) =>
                                setQuantities({ ...quantities, [l.id]: e.target.value })
                              }
                              className="h-9 w-24 text-right tabular-nums"
                            />
                          )}
                          <Badge variant={l.line_status === "avvisad" ? "destructive" : "outline"}>
                            {l.line_status}
                          </Badge>
                        </div>
                        {l.comment && (
                          <p className="text-sm text-muted-foreground">Kommentar: {l.comment}</p>
                        )}
                        {l.rejection_reason && (
                          <p className="text-sm text-destructive">Avvisad: {l.rejection_reason}</p>
                        )}
                        {l.receive_deviation_note && (
                          <p className="text-sm text-amber-600">
                            Avvikelse vid mottagning: {l.receive_deviation_note}
                          </p>
                        )}
                        {o.status === "skickad" && (
                          <div className="flex items-center gap-2">
                            <Input
                              value={reasons[l.id] ?? ""}
                              onChange={(e) => setReasons({ ...reasons, [l.id]: e.target.value })}
                              placeholder="Orsak om raden avvisas"
                              className="h-9"
                            />
                            <Button size="sm" variant="outline" onClick={() => rejectLine(o, l.id)}>
                              <X className="mr-1 h-4 w-4" /> Avvisa
                            </Button>
                          </div>
                        )}
                        {(o.status === "bekraftad" || o.status === "skickad") &&
                          l.line_status !== "avvisad" && (
                            <PickRow
                              line={l}
                              supplier={o.supplier}
                              disabled={o.status === "skickad"}
                            />
                          )}
                        {l.quantity_shipped != null && (
                          <p className="text-sm text-muted-foreground">
                            Avsänt {l.quantity_shipped} {l.unit}
                            {l.quantity_received != null
                              ? ` · mottaget ${l.quantity_received} ${l.unit}`
                              : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.status === "skickad" && (
                      <Button onClick={() => confirmAll(o)}>
                        <Check className="mr-1 h-4 w-4" /> Bekräfta beställningen
                      </Button>
                    )}
                    {o.status === "bekraftad" && (
                      <Button onClick={() => doDispatch(o.id)}>
                        <Truck className="mr-1 h-4 w-4" /> Skicka leverans
                      </Button>
                    )}
                    {(o.status === "avsand" || o.status === "delvis_mottagen") && (
                      <p className="text-sm text-muted-foreground">
                        Ligger på butikens transportlager — butiken tar emot i mobilen.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </TabsContent>

        <TabsContent value="internhandel" className="space-y-3 pt-4">
          {(basis.data ?? []).length === 0 && (
            <p className="text-muted-foreground">Inga fakturaunderlag ännu.</p>
          )}
          {(basis.data ?? []).map((b: any) => (
            <div key={b.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-semibold">
                {b.store_replenishment_orders?.order_number} ·{" "}
                {b.store_replenishment_orders?.stores?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {b.seller_legal_entity_id} → {b.buyer_legal_entity_id} ·{" "}
                <span className="tabular-nums">
                  {Number(b.amount_ex_vat).toLocaleString("sv-SE")} {b.currency}
                </span>{" "}
                · {b.status}
              </p>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Send className="h-4 w-4" /> Utkast i butikerna skickas automatiskt kl 15:00.
      </p>
    </div>
  );
}
