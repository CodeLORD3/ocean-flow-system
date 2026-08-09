import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Circle,
  CircleDashed,
  CheckCircle2,
  Printer,
  Lock,
  AlertTriangle,
  Ban,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProductThumb } from "@/components/products/ProductThumb";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import {
  useCancelCustomerOrder,
  useCustomerOrderEvents,
  usePackOrderLine,
  useUpdateCustomerOrder,
  useUpdateOrderLine,
  fetchTodaysPrice,
} from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  CustomerOrderLine,
  LINE_PACK_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  totalDeviates,
  weightDeviates,
  isUncollected,
} from "@/lib/customerOrders";
import { printPackLabels } from "@/lib/customerOrderLabelPdf";
import { printQuote } from "@/lib/customerQuotePdf";
import { allergenLabel, scaleQuantity } from "@/lib/catering";


const nf = (v: any, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

function PackIcon({ status }: { status: string }) {
  if (status === "packad") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "pagaende") return <CircleDashed className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Orderkort med packvy. Packningen bokförs alltid på VÄGD vikt och räknar om
 * raden mot dagens pris — det registrerade priset är bara en uppskattning.
 */
export function CustomerOrderCard({
  order,
  open,
  onOpenChange,
  readOnly,
}: {
  order: CustomerOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
}) {
  const { activeUser } = useActiveUser();
  const packLine = usePackOrderLine();
  const updateOrder = useUpdateCustomerOrder();
  const updateLine = useUpdateOrderLine();
  const cancelOrder = useCancelCustomerOrder();
  const { data: events = [] } = useCustomerOrderEvents(order?.id);

  const [weights, setWeights] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const lines = useMemo(
    () => [...(order?.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order),
    [order],
  );

  // Vid packning räknas raderna om mot dagens prislista
  useEffect(() => {
    if (!order || !open) return;
    (async () => {
      const next: Record<string, number | null> = {};
      const w: Record<string, string> = {};
      for (const l of lines) {
        w[l.id] = String(l.quantity_packed ?? l.quantity_ordered ?? "");
        next[l.id] =
          l.price_per_unit != null
            ? Number(l.price_per_unit)
            : l.product_id
              ? await fetchTodaysPrice(l.product_id, order.store_id)
              : Number(l.estimated_price_per_unit ?? 0);
      }
      setPrices(next);
      setWeights(w);
    })();
  }, [order?.id, open]);

  if (!order) return null;

  const actualTotal = lines.reduce((s, l) => {
    const qty = Number(weights[l.id] ?? l.quantity_packed ?? l.quantity_ordered ?? 0);
    const price = Number(prices[l.id] ?? l.estimated_price_per_unit ?? 0);
    return l.pack_status === "struken" ? s : s + qty * price;
  }, 0);
  const priceAlarm = totalDeviates(Number(order.estimated_total || 0), actualTotal);

  const doPack = async (line: CustomerOrderLine) => {
    const qty = Number(String(weights[line.id] ?? "").replace(",", "."));
    if (!qty) return toast.error("Ange vägd vikt.");
    if (weightDeviates(Number(line.quantity_ordered), qty)) {
      const ok = window.confirm(
        `Vägd vikt ${nf(qty, 3)} avviker mer än 20 % från beställda ${nf(line.quantity_ordered, 3)}. Bekräfta att det är rätt.`,
      );
      if (!ok) return;
    }
    try {
      await packLine.mutateAsync({
        order,
        line,
        packedQuantity: qty,
        pricePerUnit: prices[line.id] ?? null,
        note: notes[line.id] ?? line.note,
        performedBy: activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : null,
      });
      toast.success("Raden är packad och uttaget bokfört.");
    } catch (e: any) {
      toast.error(e.message || "Raden kunde inte packas.");
    }
  };

  const setStatus = async (status: string, description: string) => {
    await updateOrder.mutateAsync({
      id: order.id,
      patch: {
        status,
        ...(status === "levererad" || status === "avhamtad"
          ? { handed_over_at: new Date().toISOString() }
          : {}),
      },
      event: { type: status, description, by: activeUser?.first_name ?? null },
    });
    toast.success(description);
  };

  const printLabels = () => {
    const packed = lines.filter((l) => l.pack_status === "packad");
    if (packed.length === 0) return toast.error("Inga packade rader att skriva etiketter för.");
    printPackLabels(
      packed.map((l) => ({
        productName: (l.products?.name || l.free_text_name || "Vara") as string,
        weightKg: Number(l.quantity_packed || 0),
        unit: l.unit,
        pricePerUnit: l.price_per_unit != null ? Number(l.price_per_unit) : null,
        total: l.line_total != null ? Number(l.line_total) : null,
        packedDate: new Date().toISOString().slice(0, 10),
        bestBefore: l.lots?.best_before ?? null,
        lotNumber: l.lots?.lot_number ?? null,
        barcode: l.products?.sku ?? null,
      })),
    );
  };

  const customerName = order.customers_retail?.name || order.customer_name_snapshot || "Kund";
  const uncollected = isUncollected(order);

  /** Preliminär offert — priset räknas alltid om mot dagens pris vid packning. */
  const makeQuote = () =>
    printQuote({
      orderNumber: order.order_number,
      storeName: (order as any).stores?.name || "",
      customerName,
      customerPhone: order.customers_retail?.phone || order.customer_phone_snapshot,
      orderTypeLabel: ORDER_TYPE_LABELS[order.order_type] ?? order.order_type,
      wantedDate: order.wanted_date,
      wantedTime: order.wanted_time,
      guestCount: order.guest_count,
      allergyNote: order.allergy_note,
      excludedAllergens: (order.excluded_allergens || []).map(allergenLabel),
      deliveryAddress:
        order.order_type === "leverans"
          ? [order.delivery_street, order.delivery_postal_code, order.delivery_city]
              .filter(Boolean)
              .join(", ")
          : null,
      note: order.note,
      lines: lines
        .filter((l) => l.pack_status !== "struken")
        .map((l) => ({
          name: (l.products?.name || l.free_text_name || "Vara") as string,
          quantity: Number(l.quantity_ordered || 0),
          unit: l.unit,
          pricePerUnit:
            l.estimated_price_per_unit != null ? Number(l.estimated_price_per_unit) : null,
          note: l.note,
        })),
    });

  /** Ändrat gästantal räknar om cateringrader med portion per gäst. */
  const changeGuestCount = async (value: string) => {
    const guests = Number(value) || null;
    await updateOrder.mutateAsync({
      id: order.id,
      patch: { guest_count: guests },
      event: { type: "andrad", description: `Antal gäster ändrat till ${guests ?? "—"}` },
    });
    if (!guests) return;
    for (const l of lines) {
      if (!l.portion_per_guest || l.locked_from_scaling || l.pack_status === "packad") continue;
      const qty = scaleQuantity({
        portionPerGuest: l.portion_per_guest,
        guestCount: guests,
        currentQuantity: Number(l.quantity_ordered || 0),
      });
      await updateLine.mutateAsync({
        id: l.id,
        orderId: order.id,
        patch: { quantity_ordered: qty },
        event: { type: "andrad", description: `Mängd omräknad till ${qty} ${l.unit}` },
      });
    }
    toast.success("Raderna är omräknade efter antal gäster.");
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {order.order_number}
            {readOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
          </SheetTitle>
          <SheetDescription>
            {customerName} · {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type} ·{" "}
            {order.wanted_date}
            {order.wanted_time ? ` kl ${order.wanted_time.slice(0, 5)}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
          <Badge variant="secondary" className="gap-1">
            <PackIcon status={order.pack_status} />
            {order.pack_status === "packad"
              ? "Packad"
              : order.pack_status === "pagaende"
                ? "Pågående"
                : "Opackad"}
          </Badge>
          {order.category === "catering" && <Badge>Catering</Badge>}
          {uncollected && (
            <Badge variant="destructive" className="gap-1">
              <Clock className="h-3 w-3" /> Ohämtad
            </Badge>
          )}
        </div>

        {(order.allergy_note || (order.excluded_allergens || []).length > 0) && (
          <div className="mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {order.allergy_note && <div className="font-semibold">Allergi: {order.allergy_note}</div>}
            {(order.excluded_allergens || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(order.excluded_allergens || []).map((a) => (
                  <Badge key={a} variant="destructive">
                    Undvik {allergenLabel(a).toLowerCase()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}


        {priceAlarm && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              Verkligt pris avviker mer än 15 % från det uppskattade. Ring kunden innan varan packas.
              <div className="font-mono tabular-nums">
                Uppskattat {nf(order.estimated_total)} kr · nu {nf(actualTotal)} kr
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="pack" className="mt-4">
          <TabsList>
            <TabsTrigger value="pack">Packning</TabsTrigger>
            <TabsTrigger value="info">Uppgifter</TabsTrigger>
            <TabsTrigger value="timeline">Historik</TabsTrigger>
          </TabsList>

          <TabsContent value="pack" className="space-y-3">
            {lines.map((l) => {
              const name = (l.products?.name || l.free_text_name || "Vara") as string;
              const done = l.pack_status === "packad";
              return (
                <Card key={l.id} className={done ? "border-emerald-500/40" : ""}>
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb src={l.products?.image_url} alt={name} static />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{name}</div>
                        <div className="font-mono text-2xl tabular-nums">
                          {nf(l.quantity_ordered, 3)} {l.unit}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {LINE_PACK_LABELS[l.pack_status] ?? l.pack_status}
                          </Badge>
                          {l.reservation_status === "reserverad" && (
                            <Badge variant="secondary" className="text-[10px]">
                              Reserverad{l.lots?.lot_number ? ` · ${l.lots.lot_number}` : ""}
                            </Badge>
                          )}
                          {l.reservation_status === "inkopsbehov" && (
                            <Badge className="bg-amber-500 text-[10px] text-amber-950">
                              Köps färskt inför leveransdagen
                            </Badge>
                          )}
                        </div>
                      </div>
                      <PackIcon status={l.pack_status} />
                    </div>

                    {!readOnly && !done && l.pack_status !== "struken" && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <Label className="text-xs">Vägd vikt ({l.unit})</Label>
                          <Input
                            inputMode="decimal"
                            className="h-12 font-mono text-lg tabular-nums"
                            value={weights[l.id] ?? ""}
                            onChange={(e) => setWeights({ ...weights, [l.id]: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Dagens pris / {l.unit}</Label>
                          <Input
                            inputMode="decimal"
                            className="h-12 font-mono tabular-nums"
                            value={prices[l.id] ?? ""}
                            onChange={(e) =>
                              setPrices({
                                ...prices,
                                [l.id]: Number(String(e.target.value).replace(",", ".")) || 0,
                              })
                            }
                          />
                        </div>
                        <div className="flex items-end">
                          <Button className="h-12 w-full sm:w-auto" onClick={() => doPack(l)}>
                            <CheckCircle2 className="mr-2 h-5 w-5" /> Packad
                          </Button>
                        </div>
                        <div className="sm:col-span-3">
                          <Input
                            className="h-11"
                            placeholder="Anteckning, t.ex. rensad eller skuren i bitar"
                            value={notes[l.id] ?? l.note ?? ""}
                            onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2 sm:col-span-3">
                          <Button
                            variant="outline"
                            className="h-11 flex-1"
                            onClick={() =>
                              updateLine.mutate({
                                id: l.id,
                                orderId: order.id,
                                patch: { pack_status: "restnoterad" },
                                event: { type: "restnoterad", description: `${name} restnoterad` },
                              })
                            }
                          >
                            Restnotera
                          </Button>
                          <Button
                            variant="outline"
                            className="h-11 flex-1"
                            onClick={() =>
                              updateLine.mutate({
                                id: l.id,
                                orderId: order.id,
                                patch: { pack_status: "struken", reserved_quantity: 0 },
                                event: { type: "struken", description: `${name} struken` },
                              })
                            }
                          >
                            Stryk rad
                          </Button>
                        </div>
                      </div>
                    )}

                    {done && (
                      <div className="font-mono text-sm tabular-nums text-muted-foreground">
                        Packat {nf(l.quantity_packed, 3)} {l.unit} ×{" "}
                        {nf(l.price_per_unit)} kr = {nf(l.line_total)} kr
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span>Uppskattat vid registrering</span>
                <span className="font-mono tabular-nums">{nf(order.estimated_total)} kr</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Verkligt pris</span>
                <span className="font-mono tabular-nums">{nf(actualTotal)} kr</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Betalning sker i kassan vid hämtning.
              </p>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-12" onClick={printLabels}>
                  <Printer className="mr-2 h-4 w-4" /> Skriv etiketter
                </Button>
                {order.pack_status === "packad" && (
                  <Button
                    className="h-12"
                    onClick={() =>
                      setStatus(
                        order.order_type === "leverans" ? "levererad" : "avhamtad",
                        order.order_type === "leverans" ? "Ordern är levererad" : "Ordern är avhämtad",
                      )
                    }
                  >
                    {order.order_type === "leverans" ? "Levererad" : "Avhämtad"}
                  </Button>
                )}
                {order.status === "forfragan" && (
                  <Button className="h-12" onClick={() => setStatus("bekraftad", "Förfrågan bekräftad")}>
                    Bekräfta förfrågan
                  </Button>
                )}
                {uncollected && (
                  <>
                    <Button
                      variant="destructive"
                      className="h-12"
                      onClick={async () => {
                        if (!window.confirm("Kassera varorna som svinn med orsak ohämtad order?")) return;
                        await cancelOrder.mutateAsync({
                          order,
                          reason: "Ohämtad order",
                          asWaste: true,
                        });
                        toast.success("Varorna är kasserade som svinn.");
                      }}
                    >
                      Kassera
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12"
                      onClick={async () => {
                        await cancelOrder.mutateAsync({ order, reason: "Åter i lager" });
                        toast.success("Varorna är återförda till lagret.");
                      }}
                    >
                      Åter i lager
                    </Button>
                  </>
                )}
                {order.status !== "avbruten" && (
                  <Button
                    variant="ghost"
                    className="h-12 text-destructive"
                    onClick={async () => {
                      const reason = window.prompt("Orsak till att ordern avbryts?");
                      if (!reason) return;
                      await cancelOrder.mutateAsync({ order, reason });
                      toast.success("Ordern är avbruten.");
                    }}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Avbryt order
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="info" className="space-y-3 text-sm">
            <Card>
              <CardContent className="space-y-1 p-4">
                <div className="font-semibold">{customerName}</div>
                <div className="text-muted-foreground">
                  {order.customers_retail?.phone || order.customer_phone_snapshot || "Telefon saknas"}
                </div>
                {order.order_type === "leverans" && (
                  <div className="text-muted-foreground">
                    {[order.delivery_street, order.delivery_postal_code, order.delivery_city]
                      .filter(Boolean)
                      .join(", ") || "Adress saknas"}
                  </div>
                )}
                {order.guest_count != null && <div>Antal gäster: {order.guest_count}</div>}
                {order.note && <div className="pt-2">{order.note}</div>}
                <div className="pt-2 text-xs text-muted-foreground">
                  Mottagen av {order.received_by_name || "okänd"} ·{" "}
                  {new Date(order.created_at).toLocaleString("sv-SE")}
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => printConfirmation(order, (order as any).stores?.name)}
              >
                <Printer className="mr-2 h-4 w-4" /> Skriv orderbekräftelse
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={async () => {
                  const text = confirmationText(order, (order as any).stores?.name);
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success("Bekräftelsen är kopierad — klistra in i SMS eller e-post.");
                  } catch {
                    window.prompt("Kopiera texten till kunden:", text);
                  }
                }}
              >
                <MessageSquare className="mr-2 h-4 w-4" /> Kopiera text till kund
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() =>
                  printPackList({
                    orders: [order],
                    storeName: (order as any).stores?.name,
                    dateLabel: `Packlista ${order.wanted_date}`,
                  })
                }
              >
                <Printer className="mr-2 h-4 w-4" /> Papperslista att packa efter
              </Button>
              <Button variant="outline" className="h-12" onClick={makeQuote}>
                <Printer className="mr-2 h-4 w-4" /> Skriv preliminär offert
              </Button>
            </div>
            <Button variant="outline" className="hidden" onClick={makeQuote}>

              <Printer className="mr-2 h-4 w-4" /> Skriv preliminär offert
            </Button>
            {!readOnly && order.category === "catering" && (
              <div className="sm:max-w-[220px]">
                <Label>Antal gäster</Label>
                <Input
                  inputMode="numeric"
                  className="h-12"
                  defaultValue={order.guest_count ?? ""}
                  onBlur={(e) => changeGuestCount(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Rader med portion per gäst räknas om automatiskt.
                </p>
              </div>
            )}
            {!readOnly && (
              <div>
                <Label>Anteckning</Label>
                <Textarea
                  defaultValue={order.note ?? ""}
                  onBlur={(e) =>
                    updateOrder.mutate({
                      id: order.id,
                      patch: { note: e.target.value },
                      event: { type: "andrad", description: "Anteckning ändrad" },
                    })
                  }
                />
              </div>
            )}

          </TabsContent>

          <TabsContent value="timeline" className="space-y-2 text-sm">
            {events.length === 0 && <p className="text-muted-foreground">Ingen historik ännu.</p>}
            {events.map((e) => (
              <div key={e.id} className="rounded-md border border-border p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{e.description || e.event_type}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("sv-SE")}
                  </span>
                </div>
                {e.performed_by && (
                  <div className="text-xs text-muted-foreground">{e.performed_by}</div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
