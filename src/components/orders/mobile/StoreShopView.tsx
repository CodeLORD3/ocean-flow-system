import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { LayoutGrid, CalendarIcon, Check, History, Minus, Plus, Search, ShoppingBag, Trash2, X, CheckCircle2, Lock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { LinePriority } from "@/components/orders/linePriority";
import { buildWeekdaySuggestion } from "@/lib/orderSuggestion";

export type ShopLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  category?: string | null;
  image_url?: string | null;
  priority: LinePriority;
  priorityQty: string;
  priorityNote: string;
  source?: "customer" | "manual";
  customerQty?: number;
  customerNames?: string[];
  topUpQty?: string;
  late?: boolean;
};

type Props = {
  storeId: string | null;
  products: any[];
  isCategoryVisible: (c: string | null | undefined) => boolean;
  lines: ShopLine[];
  setLines: React.Dispatch<React.SetStateAction<ShopLine[]>>;
  tierPrices?: Map<string, { price: number | string; currency?: string | null }>;
  currency: string;
  deliveryDate?: Date;
  setDeliveryDate: (d?: Date) => void;
  isDateDisabled: (d: Date) => boolean;
  note: string;
  setNote: (v: string) => void;
  /** Butikens tidigare ordrar med rader – underlag för förslaget "detta beställde du förra …". */
  history: any[];
  copyDropped: string[];
  onClose: () => void;
  onSubmit: (asOpen: boolean) => Promise<void> | void;
};

const MOST = "__most__";
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const fmtQty = (n: number) => String(Number(n.toFixed(1))).replace(".", ",");
const clean = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "");

/** Mobilens beställning som nätbutik: varor med bild, kundvagn och kassa. Sparlogiken ligger kvar hos sidan. */
export default function StoreShopView(p: Props) {
  const [tab, setTab] = useState<string>(MOST);
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: top = [] } = useQuery({
    queryKey: ["company-top-ordered", p.storeId],
    enabled: !!p.storeId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_top_ordered_products", { _store_id: p.storeId!, _days: 56 });
      if (error) throw error;
      return (data ?? []) as { product_id: string; order_count: number; typical_qty: number }[];
    },
  });

  const visible = useMemo(() => p.products.filter((x: any) => p.isCategoryVisible(x.category)), [p.products, p.isCategoryVisible]);
  const byId = useMemo(() => new Map(visible.map((x: any) => [x.id, x])), [visible]);
  const typical = useMemo(() => new Map(top.map((t) => [t.product_id, Number(t.typical_qty) || 0])), [top]);
  const timesOrdered = useMemo(() => new Map(top.map((t) => [t.product_id, Number(t.order_count) || 0])), [top]);
  const categories = useMemo(
    () => Array.from(new Set(visible.map((x: any) => x.category || "Övrigt"))).sort((a, b) => a.localeCompare(b, "sv")),
    [visible],
  );

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return visible.filter((x: any) => x.name.toLowerCase().includes(s) || String(x.sku || "").toLowerCase().includes(s)).slice(0, 60);
    if (tab === MOST) return top.map((t) => byId.get(t.product_id)).filter(Boolean) as any[];
    return visible.filter((x: any) => (x.category || "Övrigt") === tab);
  }, [q, tab, visible, top, byId]);

  const suggestion = useMemo(() => buildWeekdaySuggestion(p.history, p.deliveryDate), [p.history, p.deliveryDate]);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [showAllSug, setShowAllSug] = useState(false);
  const sugItems = useMemo(
    () => (suggestion?.lines ?? []).map((s) => ({ s, x: byId.get(s.product_id) as any })).filter((r) => !!r.x),
    [suggestion, byId],
  );
  const sugMissing = (suggestion?.lines.length ?? 0) - sugItems.length;

  const lineOf = (id: string) => p.lines.find((l) => l.product_id === id);
  const active = p.lines.filter((l) => num(l.quantity) > 0);
  const [catOpen, setCatOpen] = useState(false);
  const [bump, setBump] = useState(0);

  const setQty = (id: string, n: number) =>
    p.setLines((prev) =>
      prev.map((l) => {
        if (l.product_id !== id) return l;
        if (l.source === "customer") {
          const top = Math.max(0, n - (l.customerQty ?? 0));
          return { ...l, topUpQty: top > 0 ? fmtQty(top).replace(",", ".") : "", quantity: String(Number(((l.customerQty ?? 0) + top).toFixed(1))) };
        }
        return { ...l, quantity: n > 0 ? String(Number(n.toFixed(1))) : "" };
      }),
    );
  const remove = (id: string) => p.setLines((prev) => prev.filter((l) => l.product_id !== id || l.source === "customer"));
  const newLine = (x: any, qty: number): ShopLine => ({
    product_id: x.id, product_name: x.name, unit: x.unit || "ST", quantity: String(qty), category: x.category || null,
    image_url: x.image_url ?? null, priority: "nice", priorityQty: "", priorityNote: "",
  });
  const add = (x: any, qty?: number) => {
    setBump((b) => b + 1);
    const start = qty ?? (typical.get(x.id) || 1);
    p.setLines((prev) => (prev.some((l) => l.product_id === x.id) ? prev : [...prev, newLine(x, start)]));
  };
  /** Lägger till förslagets varor som saknas i vagnen. Det som redan ligger där (även kundbeställt) rörs inte. */
  const addAllSuggested = () => {
    setBump((b) => b + 1);
    p.setLines((prev) => {
      const have = new Set(prev.map((l) => l.product_id));
      return [...prev, ...sugItems.filter((r) => !have.has(r.x.id)).map((r) => newLine(r.x, r.s.quantity))];
    });
  };
  const step = (id: string, d: number) => {
    const l = lineOf(id);
    if (!l) return;
    const next = Math.max(l.source === "customer" ? l.customerQty ?? 0 : 0, num(l.quantity) + d);
    if (next <= 0 && l.source !== "customer") remove(id);
    else setQty(id, next);
  };
  const toggleMust = (id: string) =>
    p.setLines((prev) =>
      prev.map((l) =>
        l.product_id !== id || l.source === "customer"
          ? l
          : l.priority === "must"
            ? { ...l, priority: "nice", priorityQty: "", priorityNote: "" }
            : { ...l, priority: "must", priorityQty: l.quantity },
      ),
    );

  const stepper = (l: ShopLine, big = false) => (
    <div className={cn("flex items-center rounded-full border border-primary/40 bg-primary/5", big ? "h-12" : "h-11")}>
      <button type="button" aria-label="Minska" className="flex h-full w-11 items-center justify-center text-primary" onClick={() => step(l.product_id, -1)}>
        <Minus className="h-5 w-5" />
      </button>
      <input
        inputMode="decimal"
        aria-label={`Antal ${l.product_name}`}
        value={String(l.quantity).replace(".", ",")}
        onChange={(e) => setQty(l.product_id, num(clean(e.target.value)))}
        onFocus={(e) => e.target.select()}
        className="h-full w-full min-w-0 bg-transparent text-center font-mono text-[16px] font-semibold tabular-nums text-foreground outline-none"
      />
      <button type="button" aria-label="Öka" className="flex h-full w-11 items-center justify-center text-primary" onClick={() => step(l.product_id, 1)}>
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );

  const card = (x: any) => {
    const l = lineOf(x.id);
    const t = typical.get(x.id);
    const inCart = !!l && num(l.quantity) > 0;
    const unit = (x.unit || "st").toLowerCase();
    return (
      <div key={x.id} className="flex min-w-0 flex-col">
        <div className={cn("relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted", inCart && "ring-2 ring-primary")}>
          {x.image_url ? (
            <img src={x.image_url} alt={x.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ShoppingBag className="h-10 w-10" /></div>
          )}
          {inCart && (
            <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 font-mono text-[14px] font-semibold tabular-nums text-primary-foreground">
              {fmtQty(num(l!.quantity))} {unit}
            </span>
          )}
          {!l && (
            <button type="button" aria-label={`Lägg till ${x.name}`} onClick={() => add(x)}
              className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-full bg-card text-primary shadow-md active:scale-95">
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="space-y-0.5 pt-2">
          <div className="line-clamp-2 break-words text-[15px] font-semibold leading-tight text-foreground">{x.name}</div>
          {t ? (
            <div className="text-[13px] leading-snug text-muted-foreground">
              Vanlig beställning: <span className="font-mono font-semibold tabular-nums text-foreground">{fmtQty(t)} {unit}</span>
              {(timesOrdered.get(x.id) ?? 0) > 1 && <span className="block">beställd {timesOrdered.get(x.id)} ggr</span>}
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground">{unit}</div>
          )}
        </div>
        {l && <div className="pt-2">{stepper(l)}</div>}
      </div>
    );
  };

  const grouped = useMemo(() => {
    const g = new Map<string, ShopLine[]>();
    for (const l of p.lines) {
      const c = l.category || "Övrigt";
      if (!g.has(c)) g.set(c, []);
      g.get(c)!.push(l);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [p.lines]);

  const submit = async (asOpen: boolean) => {
    setSending(true);
    try { await p.onSubmit(asOpen); } finally { setSending(false); }
  };

  const panel = (title: string, onClose: () => void, body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
        <Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Stäng" onClick={onClose}><X className="h-6 w-6" /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">{body}</div>
      {footer && <div className="shrink-0 border-t border-border bg-card px-4 py-3">{footer}</div>}
    </div>
  );

  const datePicker = (
    <div className="space-y-2">
      <Button variant="outline" className={cn("h-12 w-full justify-start gap-2 text-[16px] font-normal", !p.deliveryDate && "text-muted-foreground")} onClick={() => setCalOpen((v) => !v)}>
        <CalendarIcon className="h-5 w-5" />
        {p.deliveryDate ? format(p.deliveryDate, "EEEE d MMMM", { locale: sv }) : "Välj leveransdag…"}
      </Button>
      {calOpen && (
        <div className="flex justify-center rounded-md border border-border">
          <Calendar mode="single" locale={sv} weekStartsOn={1} selected={p.deliveryDate} disabled={p.isDateDisabled}
            onSelect={(d) => { p.setDeliveryDate(d); setCalOpen(false); }} className="pointer-events-auto p-3" />
        </div>
      )}
    </div>
  );

  const sugLeft = sugItems.filter((r) => !lineOf(r.x.id));
  const sugShown = showAllSug ? sugItems : sugItems.slice(0, 4);
  const suggestionBox =
    p.deliveryDate && suggestion && sugItems.length > 0 && hiddenFor !== suggestion.date ? (
      <section aria-label="Förslag" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <History className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-snug text-foreground">
              Detta beställde du {suggestion.exactLastWeek ? "förra veckan, " : ""}
              {format(new Date(`${suggestion.date}T12:00:00`), "EEEE d MMMM", { locale: sv })}
            </div>
            <div className="text-[14px] text-muted-foreground">
              {sugItems.length} {sugItems.length === 1 ? "vara" : "varor"} · inget läggs i korgen förrän du trycker
            </div>
          </div>
          <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-11 w-11 shrink-0" aria-label="Dölj förslaget" onClick={() => setHiddenFor(suggestion.date)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ul className="divide-y divide-border/60 rounded-md bg-card">
          {sugShown.map(({ s, x }) => {
            const inCart = !!lineOf(x.id);
            const unit = (x.unit || s.unit || "st").toLowerCase();
            return (
              <li key={x.id} className="flex min-h-14 items-center gap-2 px-2 py-1.5">
                {x.image_url ? (
                  <img src={x.image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"><ShoppingBag className="h-5 w-5" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words text-[15px] leading-tight text-foreground">{x.name}</span>
                  <span className="font-mono text-[14px] font-semibold tabular-nums text-muted-foreground">{fmtQty(s.quantity)} {unit}</span>
                </span>
                {inCart ? (
                  <span className="flex h-11 shrink-0 items-center gap-1 px-2 text-[14px] font-semibold text-primary"><Check className="h-4 w-4" /> I korgen</span>
                ) : (
                  <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full border-primary/40 text-primary" aria-label={`Lägg ${x.name} i korgen`} onClick={() => add(x, s.quantity)}>
                    <Plus className="h-5 w-5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {sugItems.length > 4 && (
          <button type="button" onClick={() => setShowAllSug((v) => !v)} className="min-h-11 w-full text-center text-[15px] font-semibold text-primary">
            {showAllSug ? "Visa färre" : `Visa alla ${sugItems.length} varor`}
          </button>
        )}
        {sugMissing > 0 && (
          <p className="text-[13px] text-muted-foreground">{sugMissing} {sugMissing === 1 ? "vara" : "varor"} från den dagen går inte att beställa längre.</p>
        )}
        {sugLeft.length > 0 ? (
          <Button className="h-12 w-full gap-2 text-[16px]" onClick={addAllSuggested}>
            <ShoppingBag className="h-5 w-5" /> Lägg {sugLeft.length === sugItems.length ? "allt" : `resten (${sugLeft.length})`} i korgen
          </Button>
        ) : (
          <p className="flex min-h-11 items-center justify-center gap-1 text-[15px] font-semibold text-primary"><CheckCircle2 className="h-5 w-5" /> Allt ligger i korgen – ändra antal i kundvagnen</p>
        )}
      </section>
    ) : null;

  const recent = p.lines.filter((l) => num(l.quantity) > 0).slice(-3).reverse();
  const catLabel = tab === MOST ? null : tab;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-2 px-4 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-heading text-lg font-bold text-foreground">Beställ till butiken</h1>
            <Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Stäng" onClick={p.onClose}><X className="h-6 w-6" /></Button>
          </div>
          {p.deliveryDate ? (
            <button type="button" onClick={() => setCalOpen((v) => !v)} className="flex min-h-11 w-full items-center gap-2 rounded-md bg-muted px-3 text-left text-[15px]">
              <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">Leverans:</span>
              <span className="font-semibold text-foreground">{format(p.deliveryDate, "EEEE d MMMM", { locale: sv })}</span>
              <span className="ml-auto text-[14px] text-primary">Ändra</span>
            </button>
          ) : (
            <button type="button" onClick={() => setCalOpen((v) => !v)} className="w-full rounded-lg border-2 border-primary bg-primary/5 p-3 text-left">
              <span className="flex items-center gap-2 text-[16px] font-semibold text-foreground"><CalendarIcon className="h-5 w-5 text-primary" /> Välj leveransdag först</span>
              <span className="mt-1 block text-[14px] text-muted-foreground">Då kommer kundernas beställningar med i vagnen.</span>
            </button>
          )}
          {calOpen && !checkoutOpen && (
            <div className="flex justify-center rounded-md border border-border">
              <Calendar mode="single" locale={sv} weekStartsOn={1} selected={p.deliveryDate} disabled={p.isDateDisabled}
                onSelect={(d) => { p.setDeliveryDate(d); setCalOpen(false); }} className="pointer-events-auto p-3" />
            </div>
          )}
          {suggestionBox}
          {p.copyDropped.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-[14px]">Kunde inte tas med: {p.copyDropped.join(", ")}</p>
          )}
        </div>

        <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-background px-4 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök vara" className="h-12 pl-10 text-[16px]" />
          </div>
          {!q && (
            <div className="flex gap-1.5" role="tablist">
              <button type="button" role="tab" aria-selected={tab === MOST} onClick={() => setTab(MOST)}
                className={cn("min-h-11 shrink-0 rounded-full border px-3 text-[15px]", tab === MOST ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground")}>
                Mest beställt
              </button>
              {catLabel && (
                <button type="button" role="tab" aria-selected onClick={() => setCatOpen(true)}
                  className="min-h-11 min-w-0 truncate rounded-full border border-primary bg-primary px-3 text-[15px] text-primary-foreground">
                  {catLabel}
                </button>
              )}
              <button type="button" onClick={() => setCatOpen(true)}
                className="ml-auto flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-[15px] text-foreground">
                <LayoutGrid className="h-4 w-4" /> {catLabel ? "Byt" : "Alla kategorier"}
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-6 pt-3">
          {shown.length === 0 ? (
            <p className="py-10 text-center text-[16px] text-muted-foreground">
              {q ? "Ingen vara matchar sökningen." : tab === MOST ? "Inga beställningar de senaste 8 veckorna ännu." : "Inga varor i kategorin."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">{shown.map(card)}</div>
          )}
          {!q && tab === MOST && shown.length > 0 && (
            <p className="py-6 text-center text-[15px] text-muted-foreground">Hittar du inte varan? Sök eller välj kategori.</p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 py-3 group-data-[kb=true]:hidden">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setCartOpen(true)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left">
            <span key={bump} className="relative shrink-0 animate-in zoom-in-50 duration-300">
              <ShoppingBag className="h-7 w-7 text-primary" />
              {active.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-mono text-[12px] font-bold text-primary-foreground">{active.length}</span>
              )}
            </span>
            <span className="flex min-w-0 -space-x-2 pl-2">
              {recent.map((l) => l.image_url ? (
                <img key={l.product_id} src={l.image_url} alt="" className="h-9 w-9 shrink-0 rounded-full border-2 border-card object-cover" />
              ) : null)}
            </span>
            <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">{active.length === 0 ? "Kundvagnen är tom" : "Kundvagn"}</span>
          </button>
          <Button className="h-12 shrink-0 text-[16px]" disabled={active.length === 0} onClick={() => setCheckoutOpen(true)}>Till kassan</Button>
        </div>
      </div>

      {catOpen && (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-foreground/40" onClick={() => setCatOpen(false)}>
          <div className="max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
            <h2 className="mb-2 font-heading text-lg font-bold text-foreground">Kategorier</h2>
            <div className="divide-y divide-border">
              {[MOST, ...categories].map((c) => (
                <button key={c} type="button" onClick={() => { setTab(c); setCatOpen(false); }}
                  className={cn("flex min-h-12 w-full items-center justify-between text-left text-[16px]", tab === c ? "font-semibold text-primary" : "text-foreground")}>
                  {c === MOST ? "Mest beställt" : c}
                  {tab === c && <CheckCircle2 className="h-5 w-5" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cartOpen && panel(
        `Kundvagn (${active.length})`,
        () => setCartOpen(false),
        p.lines.length === 0 ? (
          <p className="py-10 text-center text-[16px] text-muted-foreground">Kundvagnen är tom.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([cat, ls]) => (
              <div key={cat} className="space-y-2">
                <div className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{cat}</div>
                {ls.map((l) => (
                  <div key={l.product_id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words text-[16px] font-semibold text-foreground">{l.product_name}</div>
                        {l.source === "customer" && (
                          <div className="flex items-start gap-1 text-[14px] text-muted-foreground">
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-words">Kundbeställt {fmtQty(l.customerQty ?? 0)} {l.unit.toLowerCase()}{l.customerNames?.length ? ` – ${l.customerNames.join(", ")}` : ""}</span>
                          </div>
                        )}
                      </div>
                      {l.source !== "customer" && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Ta bort ${l.product_name}`} onClick={() => remove(l.product_id)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">{stepper(l, true)}</div>
                      <span className="w-10 shrink-0 text-[14px] text-muted-foreground">{l.unit.toLowerCase()}</span>
                    </div>
                    {l.source !== "customer" && (
                      <button type="button" onClick={() => toggleMust(l.product_id)}
                        className={cn("min-h-11 w-full rounded-md border px-3 text-[15px]", l.priority === "must" ? "border-destructive/50 bg-destructive/10 font-semibold text-destructive" : "border-border text-muted-foreground")}>
                        {l.priority === "must" ? "Måste med ✓" : "Märk som måste med"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ),
        <Button className="h-14 w-full text-[17px]" disabled={active.length === 0} onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
          Till kassan
        </Button>,
      )}

      {checkoutOpen && panel(
        "Kassa",
        () => setCheckoutOpen(false),
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[15px] font-semibold text-foreground">Leveransdag <span className="text-destructive">*</span></div>
            {datePicker}
          </div>
          <div className="space-y-1.5">
            <div className="text-[15px] font-semibold text-foreground">Meddelande (valfritt)</div>
            <Textarea value={p.note} onChange={(e) => p.setNote(e.target.value)} placeholder="T.ex. brådskande leverans" className="min-h-[72px] text-[16px]" />
          </div>
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[15px]">
              <span className="font-semibold">{active.length} {active.length === 1 ? "vara" : "varor"}</span>
            </div>
            <div className="divide-y divide-border/60">
              {active.map((l) => (
                <div key={l.product_id} className="flex items-start justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 break-words text-[15px] text-foreground">
                    {l.product_name}{l.priority === "must" && <span className="ml-1 text-[13px] font-semibold text-destructive">måste med</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[15px] font-semibold tabular-nums">{fmtQty(num(l.quantity))} {l.unit.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground">Ordern kan inte ändras efter att den skickats.</p>
        </div>,
        <div className="space-y-2">
          <Button className="h-14 w-full gap-2 text-[17px]" disabled={!p.deliveryDate || active.length === 0 || sending} onClick={() => submit(false)}>
            <CheckCircle2 className="h-5 w-5" /> Skicka beställning
          </Button>
          <Button variant="outline" className="h-12 w-full gap-2 border-warning/40 text-[16px] text-warning" disabled={!p.deliveryDate || active.length === 0 || sending} onClick={() => submit(true)}>
            <Users className="h-5 w-5" /> Spara som öppen
          </Button>
          {!p.deliveryDate && <p className="text-center text-[14px] text-destructive">Välj leveransdag först.</p>}
        </div>,
      )}
    </div>
  );
}
