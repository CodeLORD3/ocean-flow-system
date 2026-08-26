import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductThumb } from "@/components/products/ProductThumb";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import {
  usePackOrderLine,
  useUnpackOrderLine,
  useUpdateCustomerOrder,
  useUpdateOrderLine,
  fetchTodaysPrice,
} from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  CustomerOrderLine,
  LINE_PACK_LABELS,
  totalDeviates,
  weightDeviates,
} from "@/lib/customerOrders";

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Vikt visas med max en decimal på kilo (2 kg blir "2") och utan decimal på styck. */
const qtyText = (v: unknown, unit?: string | null) =>
  Number(v ?? 0).toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: String(unit ?? "").toLowerCase().startsWith("st") ? 0 : 1,
  });


/**
 * Tydlig statusruta per rad: nummer när den är opackad, bock när den är klar.
 * Siffran gör det lätt att se hur många varor som är kvar.
 */
function PackStep({ status, index }: { status: string; index: number }) {
  if (status === "packad")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-row-ok-edge text-primary-foreground">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  if (status === "struken")
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs text-muted-foreground">
        –
      </span>
    );
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-background font-mono text-xs font-semibold tabular-nums">
      {index}
    </span>
  );
}



/**
 * Packning direkt i orderns rullgardin — ingen dialog behövs.
 * Vägd vikt och dagens pris matas in per rad, precis som i fiskdisken.
 */
export function InlineOrderPacking({
  order,
  currency,
  onOrderPacked,
  highlightProduct,
}: {
  order: CustomerOrder;
  currency: string;
  /** Anropas när sista raden packats (ordern blir grön) så rullgardinen kan stängas. */
  onOrderPacked?: () => void;
  /** Varunamn som ska markeras, t.ex. vid hopp från totallistan. */
  highlightProduct?: string | null;
}) {
  const { activeUser } = useActiveUser();
  const packLine = usePackOrderLine();
  const unpackLine = useUnpackOrderLine();
  const updateLine = useUpdateOrderLine();
  const updateOrder = useUpdateCustomerOrder();

  const [weights, setWeights] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openLine, setOpenLine] = useState<string | null>(null);

  const lines = useMemo(
    () => [...(order.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order),
    [order],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p: Record<string, number | null> = {};
      const w: Record<string, string> = {};
      for (const l of lines) {
        w[l.id] = String(l.quantity_packed ?? l.quantity_ordered ?? "");
        p[l.id] =
          l.price_per_unit != null
            ? Number(l.price_per_unit)
            : l.product_id
              ? await fetchTodaysPrice(l.product_id, order.store_id)
              : Number(l.estimated_price_per_unit ?? 0);
      }
      if (cancelled) return;
      setWeights(w);
      setPrices(p);
      // Ingen rad öppnas automatiskt — packaren väljer själv vilken rad som ska in.
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, lines.length]);

  const actualTotal = lines.reduce((s, l) => {
    if (l.pack_status === "struken") return s;
    const qty = Number(String(weights[l.id] ?? l.quantity_packed ?? l.quantity_ordered ?? 0).replace(",", "."));
    const price = Number(prices[l.id] ?? l.estimated_price_per_unit ?? 0);
    return s + qty * price;
  }, 0);
  const priceAlarm = totalDeviates(Number(order.estimated_total || 0), actualTotal);

  const active = lines.filter((l) => l.pack_status !== "struken");
  const allPacked = active.length > 0 && active.every((l) => l.pack_status === "packad");

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
      toast.success("Raden är packad.");
      const next = active.find((l) => l.id !== line.id && l.pack_status !== "packad");
      setOpenLine(next?.id ?? null);
      if (!next) {
        // Ordern är komplett packad — stäng rullgardinen.
        onOrderPacked?.();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Raden kunde inte packas.");
    }
  };

  const handOver = async () => {
    const delivery = order.order_type === "leverans";
    await updateOrder.mutateAsync({
      id: order.id,
      patch: {
        status: delivery ? "levererad" : "avhamtad",
        handed_over_at: new Date().toISOString(),
      },
      event: {
        type: delivery ? "levererad" : "avhamtad",
        description: delivery ? "Ordern är levererad" : "Ordern är avhämtad",
        by: activeUser?.first_name ?? null,
      },
    });
    toast.success(delivery ? "Ordern är levererad." : "Ordern är avhämtad.");
    onOrderPacked?.();
  };

  const packingStarted = !!order.packing_started_at || order.pack_status !== "opackad";
  const anyPacked = lines.some((l) => l.pack_status === "packad");
  /** Går att ångra så länge ingen rad hunnit packas och ordern inte lämnats ut. */
  const canUndoPacking =
    packingStarted && !anyPacked && !order.handed_over_at && !["levererad", "avhamtad"].includes(order.status ?? "");

  /** Startar packningen: hela orderraden i listan blir gul och läget sparas. */
  const startPacking = async () => {
    await updateOrder.mutateAsync({
      id: order.id,
      patch: { packing_started_at: new Date().toISOString() } as any,
      event: {
        type: "andrad",
        description: "Packning påbörjad",
        by: activeUser?.first_name ?? null,
      },
    });
    toast.success("Packningen är påbörjad.");
  };

  /** Ångrar en felaktig start: ordern går tillbaka till opackad. */
  const undoPacking = async () => {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        patch: { packing_started_at: null, pack_status: "opackad" } as any,
        event: {
          type: "andrad",
          description: "Packning ångrad – ordern är opackad igen",
          by: activeUser?.first_name ?? null,
        },
      });
      toast.success("Packningen är ångrad.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ångra packningen.");
    }
  };

  /** Kryssrutan packar raden direkt med beställd/vägd mängd, eller ångrar. */
  const toggleLine = async (line: CustomerOrderLine, next: boolean) => {
    if (next) {
      if (!order.packing_started_at && order.pack_status === "opackad") {
        await updateOrder.mutateAsync({
          id: order.id,
          patch: { packing_started_at: new Date().toISOString() } as any,
        });
      }
      await doPack(line);
      return;
    }
    try {
      await unpackLine.mutateAsync({
        order,
        line,
        performedBy: activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : null,
      });
      toast.success("Raden är opackad igen.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ångra.");
    }
  };

  return (
    <div className="space-y-2">
      {priceAlarm && (
        <div className="rounded-md border border-row-warn-edge/40 bg-row-warn p-2.5 text-sm">
          Verkligt pris avviker mer än 15 % från uppskattningen — ring kunden innan packning.
          <div className="font-mono tabular-nums">
            Uppskattat {nf(order.estimated_total)} {currency} · nu {nf(actualTotal)} {currency}
          </div>
        </div>
      )}

      {!packingStarted && (
        <Button
          className="h-11 w-full sm:w-auto"
          disabled={updateOrder.isPending}
          onClick={startPacking}
        >
          <PlayCircle className="mr-2 h-4 w-4" /> Starta packning
        </Button>
      )}

      {canUndoPacking && (
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={updateOrder.isPending}
          onClick={undoPacking}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Ångra packning
        </Button>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {lines.map((l, i) => {
          const name = (l.products?.name || l.free_text_name || "Vara") as string;
          const done = l.pack_status === "packad";
          const struck = l.pack_status === "struken";
          const expanded = openLine === l.id && !done && !struck;
          /* Packad rad är gul under pågående packning och grön när hela ordern är klar. */
          const rowBg = done
            ? allPacked
              ? "bg-row-ok"
              : "bg-row-warn"
            : struck
              ? "bg-row-off"
              : "bg-card";
          return (
            <li key={l.id} className={rowBg}>
              <div className="flex items-center gap-1">
                {/* Stor kryssruta för tumtryck: markerar just den varan som packad. */}
                <label
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    className="h-6 w-6"
                    checked={done}
                    disabled={struck || packLine.isPending || unpackLine.isPending}
                    onCheckedChange={(v) => toggleLine(l, !!v)}
                    aria-label={`Markera ${name} som packad`}
                  />
                </label>
              <button
                type="button"
                onClick={() => setOpenLine(expanded ? null : l.id)}
                disabled={done || struck}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 px-1 py-1 text-left text-[13px] disabled:cursor-default sm:flex-nowrap"
              >
                <PackStep status={l.pack_status} index={i + 1} />

                <ProductThumb
                  src={l.products?.image_url}
                  alt={name}
                  productId={l.product_id}
                  className="h-8 w-10 rounded"
                />
                {/* Mobil: produktnamnet ligger på egen rad ovanför siffrorna så det aldrig kapas. */}
                <span
                  className={`order-first w-full whitespace-normal break-words font-medium leading-snug sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate ${
                    struck ? "line-through" : ""
                  }`}
                >
                  {name}
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">
                  {qtyText(l.quantity_packed ?? l.quantity_ordered, l.unit)} {l.unit}
                </span>
                <span className="hidden w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                  {l.price_per_unit != null || l.estimated_price_per_unit != null
                    ? `${nf(l.price_per_unit ?? l.estimated_price_per_unit)} ${currency}`
                    : "—"}
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
                  {l.line_total != null
                    ? `${nf(l.line_total)} ${currency}`
                    : `${nf(Number(l.quantity_ordered || 0) * Number(l.estimated_price_per_unit ?? 0))} ${currency}`}
                </span>
                {l.paid_quantity != null &&
                  l.quantity_packed != null &&
                  Math.abs(Number(l.quantity_packed) - Number(l.paid_quantity)) > 0.001 && (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-amber-600">
                      Betald {qtyText(l.paid_quantity, l.unit)} {l.unit}
                    </Badge>
                  )}
                {l.pack_status !== "opackad" && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {LINE_PACK_LABELS[l.pack_status] ?? l.pack_status}
                  </Badge>
                )}

              </button>
              </div>

              {(done || struck || l.pack_status === "restnoterad") && (
                <div className="flex justify-end px-2 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 bg-background/60 px-2 text-[11px]"
                    disabled={unpackLine.isPending || updateLine.isPending}
                    onClick={async () => {
                      try {
                        if (done) {
                          await unpackLine.mutateAsync({
                            order,
                            line: l,
                            performedBy: activeUser
                              ? `${activeUser.first_name} ${activeUser.last_name}`
                              : null,
                          });
                        } else {
                          await updateLine.mutateAsync({
                            id: l.id,
                            orderId: order.id,
                            patch: { pack_status: "opackad" },
                            event: { type: "rad_opackad", description: `${name} återställd` },
                          });
                        }
                        toast.success("Raden är opackad igen.");
                        setOpenLine(l.id);
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : "Kunde inte ångra.");
                      }
                    }}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Ångra packning
                  </Button>
                </div>
              )}

              {l.note && !expanded && (
                <div className="px-2 pb-1 pl-[4.25rem] text-xs text-muted-foreground">{l.note}</div>
              )}




              {expanded && (
                <div className="grid gap-1.5 border-t border-border px-2 pb-2 pt-1.5 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-0.5">
                    <Label className="text-[11px] text-muted-foreground">Vägd vikt ({l.unit})</Label>
                    <Input
                      inputMode="decimal"
                      className="h-8 font-mono text-sm tabular-nums"
                      value={weights[l.id] ?? ""}
                      onChange={(e) => setWeights({ ...weights, [l.id]: e.target.value })}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[11px] text-muted-foreground">
                      {l.price_locked ? `Betalt pris / ${l.unit} (låst)` : `Dagens pris / ${l.unit}`}
                    </Label>
                    <Input
                      inputMode="decimal"
                      readOnly={!!l.price_locked}
                      title={
                        l.price_locked
                          ? "Webbordern är förskottsbetald — radpriset är låst från Shopify."
                          : undefined
                      }
                      className={`h-8 font-mono text-sm tabular-nums ${
                        l.price_locked ? "bg-muted text-muted-foreground" : ""
                      }`}
                      value={prices[l.id] ?? ""}
                      onChange={(e) => {
                        if (l.price_locked) return;
                        setPrices({
                          ...prices,
                          [l.id]: Number(String(e.target.value).replace(",", ".")) || 0,
                        });
                      }}
                    />
                  </div>

                  <div className="flex items-end">
                    <Button size="sm" className="h-8 w-full text-xs sm:w-auto" onClick={() => doPack(l)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Packad
                    </Button>
                  </div>
                  <Input
                    className="h-8 text-xs sm:col-span-3"
                    placeholder="Anteckning, t.ex. rensad eller skuren i bitar"
                    value={notes[l.id] ?? l.note ?? ""}
                    onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })}
                  />
                  <div className="flex gap-1.5 sm:col-span-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 text-xs"
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
                      size="sm"
                      className="h-7 flex-1 text-xs"
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
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        {allPacked && !["levererad", "avhamtad"].includes(order.status) && (
          <Button className="h-11" onClick={handOver}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {order.order_type === "leverans" ? "Levererad" : "Avhämtad"}
          </Button>
        )}
      </div>
    </div>
  );
}
