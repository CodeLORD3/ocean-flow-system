import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Send, Trash2, CalendarIcon, Radio, Users } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ProductThumb } from "@/components/products/ProductThumb";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { logActivity } from "@/hooks/useActivityLog";

/**
 * Delad arbetsyta för en öppen beställning. Flera personer i butiken kan fylla
 * på samma order samtidigt — ändringar sparas direkt och speglas live via
 * Supabase Realtime (presence + broadcast) till alla som har ordern öppen.
 */
export function OpenOrderEditor({ order, products, toast, isDateDisabled, allowedWeekdays, onClose }: {
  order: any;
  products: any[];
  toast: any;
  isDateDisabled: (date: Date) => boolean;
  allowedWeekdays: Set<number> | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: currentStaff } = useCurrentStaff();
  const myName = staffFullName(currentStaff) || "Någon i butiken";

  const lines: any[] = order.shop_order_lines || [];

  const [peers, setPeers] = useState<string[]>([]);
  const [events, setEvents] = useState<{ id: number; text: string }[]>([]);
  const channelRef = useRef<any>(null);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string>(order.notes || "");
  const [dateOpen, setDateOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });

  /* --- Fade på raden när någon annan ändrar antal eller lägger till en produkt --- */
  const prevQty = useRef<Record<string, number> | null>(null);
  const [flashIds, setFlashIds] = useState<Record<string, number>>({});
  const [changedLabels, setChangedLabels] = useState<{ id: string; label: string }[]>([]);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToLine = (id: string) => {
    rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashIds((f) => ({ ...f, [id]: Date.now() }));
  };

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const l of lines) map[l.id] = Number(l.quantity_ordered ?? 0);
    const prev = prevQty.current;
    prevQty.current = map;
    if (!prev) return;
    const changed = Object.keys(map).filter((id) => prev[id] === undefined || prev[id] !== map[id]);
    if (changed.length === 0) return;
    const stamp = Date.now();
    setFlashIds((f) => {
      const next = { ...f };
      for (const id of changed) next[id] = stamp;
      return next;
    });
    setChangedLabels(
      changed.map((id) => {
        const line = lines.find((l: any) => l.id === id);
        return {
          id,
          label: `${line?.products?.name || "Produkt"} · ${map[id]} ${line?.unit || line?.products?.unit || ""}`.trim(),
        };
      }),
    );
    const timer = window.setTimeout(() => {
      setFlashIds((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== stamp)));
      setChangedLabels((c) => (c.some((x) => changed.includes(x.id)) ? [] : c));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [lines]);

  /* --- Live: presence + broadcast av ändringar --- */
  useEffect(() => {
    const ch = supabase.channel(`open-order-${order.id}`, {
      config: { presence: { key: myName } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setPeers(Object.keys(ch.presenceState() || {}));
    })
      .on("broadcast", { event: "change" }, ({ payload }: any) => {
        if (!payload || payload.by === myName) return;
        const id = Date.now() + Math.random();
        setEvents((prev) => [...prev.slice(-3), { id, text: payload.text }]);
        setTimeout(() => setEvents((prev) => prev.filter((e) => e.id !== id)), 8000);
        refresh();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ name: myName, at: Date.now() });
      });
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, myName]);

  const announce = (text: string) => {
    channelRef.current?.send({ type: "broadcast", event: "change", payload: { by: myName, text } });
  };

  /* --- Produktsök --- */
  const onOrderIds = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);
  const hits = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return products
      .filter((p: any) => !onOrderIds.has(p.id) && ((p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, products, onOrderIds]);

  const addProduct = async (p: any) => {
    const { error } = await supabase.from("shop_order_lines").insert({
      shop_order_id: order.id,
      product_id: p.id,
      quantity_ordered: 1,
      unit: p.unit,
      delivery_date: order.desired_delivery_date || null,
    } as any);
    setSearch("");
    if (error) {
      toast({ title: "Kunde inte lägga till", description: error.message, variant: "destructive" });
      return;
    }
    announce(`${myName} lade till ${p.name} 1 ${p.unit || ""}`.trim());
    refresh();
  };

  const saveQty = async (line: any, value: string) => {
    const qty = Number(String(value).replace(",", "."));
    if (!value || !isFinite(qty) || qty <= 0) return;
    if (qty === Number(line.quantity_ordered)) return;
    const { error } = await supabase.from("shop_order_lines").update({ quantity_ordered: qty }).eq("id", line.id);
    if (error) {
      toast({ title: "Kunde inte spara antal", description: error.message, variant: "destructive" });
      return;
    }
    announce(`${myName} ändrade ${line.products?.name || "en produkt"} till ${qty} ${line.unit || ""}`.trim());
    refresh();
  };

  const removeLine = async (line: any) => {
    const { error } = await supabase.from("shop_order_lines").delete().eq("id", line.id);
    if (error) {
      toast({ title: "Kunde inte ta bort", description: error.message, variant: "destructive" });
      return;
    }
    announce(`${myName} tog bort ${line.products?.name || "en produkt"}`);
    refresh();
  };

  const saveNote = async () => {
    if ((order.notes || "") === note) return;
    const { error } = await supabase.from("shop_orders").update({ notes: note || null } as any).eq("id", order.id);
    if (error) {
      toast({ title: "Kunde inte spara anteckningen", description: error.message, variant: "destructive" });
      return;
    }
    announce(`${myName} uppdaterade anteckningen`);
    refresh();
  };

  const saveDate = async (d?: Date) => {
    setDateOpen(false);
    if (!d) return;
    const str = format(d, "yyyy-MM-dd");
    const { error } = await supabase.from("shop_orders").update({ desired_delivery_date: str } as any).eq("id", order.id);
    if (error) {
      toast({ title: "Kunde inte spara datum", description: error.message, variant: "destructive" });
      return;
    }
    announce(`${myName} satte avgångsdatum ${str}`);
    refresh();
  };

  const sendOrder = async () => {
    if (lines.length === 0) {
      toast({ title: "Tom beställning", description: "Lägg till minst en produkt först.", variant: "destructive" });
      return;
    }
    if (!order.desired_delivery_date) {
      toast({ title: "Välj avgångsdatum", description: "Ordern behöver ett önskat avgångsdatum innan den skickas.", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabase.from("shop_orders").update({ status: "Ny" } as any).eq("id", order.id);
    setSending(false);
    if (error) {
      toast({ title: "Kunde inte skicka", description: error.message, variant: "destructive" });
      return;
    }
    await logActivity({
      action_type: "update",
      description: `Öppen beställning skickad till grossist av ${myName} (${lines.length} rader)`,
      portal: "shop",
      store_id: order.store_id,
      entity_type: "shop_order",
      entity_id: order.id,
      performed_by: myName,
    });
    announce(`${myName} skickade beställningen till grossisten`);
    toast({ title: "Beställning skickad", description: `${lines.length} produkter skickade till grossisten.` });
    refresh();
    onClose();
  };

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const l of lines) {
      const cat = l.products?.category || "Övrigt";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(l);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [lines]);

  const selectedDate = order.desired_delivery_date ? new Date(order.desired_delivery_date + "T00:00:00") : undefined;

  return (
    <div className="space-y-3">
      {/* Header: live-indikator och vilka som är inne */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-[10px] border-primary/30 bg-primary/10 text-primary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <Radio className="h-3 w-3" /> Live · delad beställning
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Users className="h-3 w-3" /> Inne nu · {Math.max(peers.length, 1)}
        </Badge>
        <span className="text-[10px] text-muted-foreground truncate max-w-[18rem]">
          {peers.length > 0 ? peers.join(", ") : myName}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-[10px] gap-1" onClick={onClose}>
          <X className="h-3 w-3" /> Stäng
        </Button>
      </div>

      {events.length > 0 && (
        <div className="space-y-1">
          {events.map((e) => (
            <div key={e.id} className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] text-primary">
              {e.text}
            </div>
          ))}
        </div>
      )}

      {/* Produktsök */}
      <div className="relative">
        <Label className="text-xs font-medium mb-1.5 block">Lägg till produkter</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault();
                addProduct(hits[0]);
              }
            }}
            placeholder="Sök produkt (namn eller SKU)..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
            {hits.map((p: any) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60"
                onClick={() => addProduct(p)}
              >
                <ProductThumb src={p.image_url} alt={p.name} static className="w-7 h-5" />
                <span className="flex-1 truncate font-medium text-foreground">{p.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{p.sku} · {p.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Rader */}
      {lines.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Inga produkter ännu. Sök ovan och lägg till — alla i butiken kan fylla på tills ordern skickas.
        </p>
      ) : (
        <div className="space-y-1">
          {grouped.map(([cat, catLines]) => (
            <div key={cat}>
              <div className="bg-muted/40 px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                ▸ {cat} ({catLines.length})
              </div>
              {catLines.map((l: any) => (
                <div
                  key={l.id}
                  ref={(el) => {
                    rowRefs.current[l.id] = el;
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border-b border-border/30 py-1.5 transition-colors",
                    flashIds[l.id] &&
                      "animate-notice-flash bg-primary/15 ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                  )}
                >
                  <ProductThumb src={l.products?.image_url} alt={l.products?.name} static className="w-7 h-5" />
                  <span className="flex-1 truncate text-xs font-medium text-foreground">{l.products?.name || "–"}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={drafts[l.id] ?? String(l.quantity_ordered ?? "")}
                    onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const v = e.target.value;
                      setDrafts((d) => {
                        const { [l.id]: _drop, ...rest } = d;
                        return rest;
                      });
                      saveQty(l, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    }}
                    className="h-8 w-20 text-right text-xs"
                  />
                  <span className="w-8 text-[10px] text-muted-foreground">{l.unit || l.products?.unit}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(l)} aria-label="Ta bort rad">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hoppa till raden som just ändrades — syns även om man scrollat förbi den */}
      {changedLabels.length > 0 && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-sm border border-primary/50 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur animate-fade-in">
          <Radio className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nyss ändrat
          </span>
          {changedLabels.slice(0, 3).map((c) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className="h-6 max-w-[220px] truncate px-2 text-[11px]"
              onClick={() => scrollToLine(c.id)}
            >
              {c.label}
            </Button>
          ))}
          {changedLabels.length > 3 && (
            <span className="text-[11px] text-muted-foreground">+{changedLabels.length - 3} fler</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => setChangedLabels([])}
            aria-label="Stäng"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Datum + anteckning */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Önskat avgångsdatum</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-xs font-normal", !selectedDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {selectedDate ? format(selectedDate, "yyyy-MM-dd") : "Välj datum..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={saveDate}
                disabled={isDateDisabled}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Anteckning</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="T.ex. brådskande leverans, specialförpackning..."
            className="min-h-[50px] text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground">
          Ordern är öppen — grossisten ser den inte förrän du skickar den.
        </span>
        <Button size="sm" className="gap-1.5" onClick={sendOrder} disabled={sending || lines.length === 0}>
          <Send className="h-3.5 w-3.5" /> {sending ? "Skickar..." : "Skicka till grossist"}
        </Button>
      </div>
    </div>
  );
}
