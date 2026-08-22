import { useMemo, useRef, useState } from "react";
import { prepareUpload, COMPRESS_PHOTO, COMPRESS_AVATAR } from "@/lib/imageCompress";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Store as StoreIcon,
  Trash2,
  Pencil,
  MapPin,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/EmptyState";
import { CustomerOrderRow, CustomerOrderRowHeader } from "@/components/orders/CustomerOrderRow";
import { CustomerOrderWizard } from "@/components/orders/CustomerOrderWizard";
import { RetailCustomerDialog } from "@/components/orders/RetailCustomerDialog";
import { CustomerPreferencesCard } from "@/components/orders/CustomerPreferencesCard";
import { CustomerNotesCard } from "@/components/orders/CustomerNotesCard";
import { useEntityImageCounts } from "@/hooks/useEntityImages";
import { useAnonymizeRetailCustomer, useUpdateRetailCustomer } from "@/hooks/useCustomerOrders";
import {
  useOrdersForCustomer,
  useRetailCustomer,
} from "@/hooks/useRetailCustomerProfile";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  customerDisplayName,
  isUncollected,
} from "@/lib/customerOrders";
import {
  computeCustomerStats,
  hasTotalDeviation,
  isCompleted,
  isUpcoming,
  longDate,
  money,
  orderTotal,
  qtyText,
  shortDate,
} from "@/lib/retailCustomerStats";
import { getStoreCurrency } from "@/lib/currency";
import { CurrencyAmount, useSekRate } from "@/components/orders/CurrencyAmount";
import { thumbUrl, THUMB_AVATAR } from "@/lib/imageThumb";

const AVATAR_BUCKET = "logos";

type Filter = "alla" | "kommande" | "genomforda" | "avbokade" | "ohamtade";

/** Litet KPI-kort. Siffror i monospace med tabulära nollor. */
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Horisontell andelsstapel för butiks- och kategorifördelning. */
function ShareBar({ label, share, count }: { label: string; share: number; count: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {share} % · {count}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

/**
 * Kundkort för butikskunder: vem kunden är, hur ofta den handlar, vad den brukar
 * köpa, vilken butik den tillhör och om det finns något att vara uppmärksam på.
 */
export function RetailCustomerProfile({
  customerId,
  onBack,
  readOnly,
}: {
  customerId: string;
  onBack?: () => void;
  readOnly?: boolean;
}) {
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate("/customer-orders"));
  const { data: customer, isLoading } = useRetailCustomer(customerId);
  const { data: orders = [] } = useOrdersForCustomer(customerId);
  const update = useUpdateRetailCustomer();
  const anonymize = useAnonymizeRetailCustomer();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("oversikt");
  const [filter, setFilter] = useState<Filter>("alla");
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const stats = useMemo(() => computeCustomerStats(orders), [orders]);
  const { data: photoCounts } = useEntityImageCounts(
    "customer_order",
    useMemo(() => orders.map((o) => o.id), [orders]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "kommande" && !isUpcoming(o)) return false;
      if (filter === "genomforda" && !isCompleted(o)) return false;
      if (filter === "avbokade" && o.status !== "avbruten") return false;
      if (filter === "ohamtade" && !isUncollected(o)) return false;
      if (!q) return true;
      const hay = [
        o.order_number,
        o.wanted_date,
        o.stores?.name,
        o.note,
        ...(o.customer_order_lines || []).map((l) =>
          l.is_free_text ? l.free_text_name : l.products?.name,
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, filter, search]);

  const uploadAvatar = async (file: File) => {
    try {
      const prepared = await prepareUpload(file, COMPRESS_AVATAR);
      const key = `retail-customers/${customerId}-${Date.now()}-${prepared.file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(key, prepared.file, { upsert: true, contentType: prepared.contentType });
      if (error) throw error;
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(key);
      await update.mutateAsync({ id: customerId, avatar_url: data.publicUrl } as any);
      toast.success("Kundbilden är uppdaterad.");
    } catch (e: any) {
      toast.error(e.message || "Bilden kunde inte laddas upp.");
    }
  };

  /* Som i SumUp: butikens valuta först, SEK-motvärdet mot livekurs som referens.
     Hooken måste ligga före alla tidiga returer — annars byter hook-antalet. */
  const customerCurrency = getStoreCurrency(
    orders.find((order) => order.store_id === customer?.store_id)?.stores,
  );
  const sekRate = useSekRate(customerCurrency);

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Hämtar kunden…</p>;
  if (!customer)
    return (
      <div className="p-4">
        <EmptyState
          title="Kunden hittades inte"
          description="Posten kan ha raderats enligt GDPR."
          icon={<User className="h-6 w-6" />}
        />
      </div>
    );

  const fullName = customer.name?.trim() || customerDisplayName(customer);
  const blocked = !!customer.booking_blocked;
  const noShows = Number(customer.no_show_count || 0);
  const tags = customer.tags || [];
  const upcoming = stats.upcoming;
  const cur = (v: unknown) =>
    `${money(v)} ${customerCurrency}${sekRate ? ` ≈ ${money(Number(v ?? 0) * sekRate)} SEK` : ""}`;


  const lineText = (o: CustomerOrder) =>
    (o.customer_order_lines || [])
      .filter((l) => l.pack_status !== "struken")
      .map(
        (l) =>
          `${qtyText(l.quantity_packed ?? l.quantity_ordered, l.unit)} ${l.unit} ${
            l.is_free_text ? l.free_text_name : l.products?.name
          }`,
      )
      .join(" · ");

  const contactRow = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {customer.phone && (
        <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-foreground">
          <Phone className="h-3.5 w-3.5" /> {customer.phone}
        </a>
      )}
      {customer.email && (
        <a
          href={`mailto:${customer.email}`}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <Mail className="h-3.5 w-3.5" /> {customer.email}
        </a>
      )}
      {[customer.street, customer.postal_code, customer.city].filter(Boolean).length > 0 && (
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {[customer.street, customer.postal_code, customer.city].filter(Boolean).join(", ")}
        </span>
      )}
      {customer.customer_no != null && (
        <span className="font-mono tabular-nums">Kundnr {customer.customer_no}</span>
      )}
      {stats.first && <span>Kund sedan {shortDate(stats.first)}</span>}
      {stats.mainStore && (
        <span className="flex items-center gap-1">
          <StoreIcon className="h-3.5 w-3.5" /> {stats.mainStore}
        </span>
      )}
      {stats.last && <span>Senaste order {shortDate(stats.last)}</span>}
    </div>
  );

  const orderList = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Sök order, produkt eller butik"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          className="h-10"
        >
          <ToggleGroupItem value="alla" className="h-10 px-3 text-xs">
            Alla
          </ToggleGroupItem>
          <ToggleGroupItem value="kommande" className="h-10 px-3 text-xs">
            Kommande
          </ToggleGroupItem>
          <ToggleGroupItem value="genomforda" className="h-10 px-3 text-xs">
            Genomförda
          </ToggleGroupItem>
          <ToggleGroupItem value="avbokade" className="h-10 px-3 text-xs">
            Avbokade
          </ToggleGroupItem>
          <ToggleGroupItem value="ohamtade" className="h-10 px-3 text-xs">
            Ej hämtade
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          bare
          title="Inga beställningar"
          description="Ingen order matchar filtret."
          icon={<MessageSquare className="h-6 w-6" />}
        />
      ) : (
        <div>
          <CustomerOrderRowHeader currency={customerCurrency} />
          {filtered.map((o) => (
            <CustomerOrderRow
              key={o.id}
              order={o}
              canEdit={!readOnly}
              readOnly={readOnly}
              open={openRow === o.id}
              onToggle={(id) => setOpenRow((p) => (p === id ? null : id))}
              photoCount={photoCounts?.[o.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {/* Kundhuvud */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {customer.avatar_url ? (
                  <img
                    src={thumbUrl(customer.avatar_url, THUMB_AVATAR)}
                    alt={`Kundbild för ${fullName}`}
                    className="h-full w-full object-cover"
                   loading="lazy" decoding="async" />
                ) : (
                  <User className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    aria-label="Byt kundbild"
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                  {customer.avatar_url && (
                    <button
                      type="button"
                      aria-label="Ta bort kundbild"
                      onClick={() => update.mutate({ id: customerId, avatar_url: null } as any)}
                      className="absolute -top-1 -right-1 rounded-full border border-border bg-card p-1 text-muted-foreground shadow-sm hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2 text-[11px]"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Kundbeställningar
                </Button>
                <h1 className="text-lg font-semibold">{fullName}</h1>
                {customer.nickname && (
                  <span className="text-sm text-muted-foreground">”{customer.nickname}”</span>
                )}
                {customer.is_company && <Badge variant="secondary">Organisation</Badge>}
                {customer.name_review_needed && (
                  <Badge className="border-warning/40 bg-warning/15 text-warning" variant="outline">
                    Genomgång
                  </Badge>
                )}
                {blocked && (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" /> Spärrad
                    {noShows > 0 && ` · ${noShows} uteblivna`}
                  </Badge>
                )}
                {!blocked && noShows > 0 && (
                  <Badge className="border-warning/40 bg-warning/15 text-warning" variant="outline">
                    {noShows} uteblivna
                  </Badge>
                )}
                {tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
              {contactRow}
              {blocked && customer.booking_block_reason && (
                <p className="text-xs text-destructive">Spärrorsak: {customer.booking_block_reason}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && (
                <Button className="h-10" onClick={() => setWizardOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Ny order
                </Button>
              )}
              {customer.phone && (
                <>
                  <Button asChild variant="outline" className="h-10">
                    <a href={`tel:${customer.phone}`}>
                      <Phone className="mr-1 h-4 w-4" /> Ring kund
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="h-10">
                    <a href={`sms:${customer.phone}`}>
                      <MessageSquare className="mr-1 h-4 w-4" /> Skicka SMS
                    </a>
                  </Button>
                </>
              )}
              {!readOnly && (
                <>
                  <Button variant="outline" className="h-10" onClick={() => setTab("anteckningar")}>
                    <Plus className="mr-1 h-4 w-4" /> Anteckning
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1 h-4 w-4" /> Redigera kund
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 text-destructive"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Radera kundens personuppgifter? Ordrarna behålls anonymiserade för bokföringen.",
                        )
                      )
                        return;
                      await anonymize.mutateAsync(customerId);
                      toast.success("Kunduppgifterna är raderade.");
                      goBack();
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> GDPR-radering
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="ordrar">Ordrar ({stats.total})</TabsTrigger>
          <TabsTrigger value="kopstatistik">Köpstatistik</TabsTrigger>
          <TabsTrigger value="anteckningar">Anteckningar</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------- Översikt */}
        <TabsContent value="oversikt" className="space-y-4">
          {upcoming.length > 0 && (
            <Card className="border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Kommande order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcoming.map((o) => (
                  <div key={o.id} className="space-y-1 rounded-md border border-border/70 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span>{longDate(o.wanted_date)}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>Hämtning {o.stores?.name || "—"}</span>
                      {o.wanted_time && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-mono tabular-nums">
                            {o.wanted_time.slice(0, 5)}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{lineText(o)}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono font-semibold tabular-nums">
                        {cur(orderTotal(o))}
                      </span>
                      <span className="text-muted-foreground">· Status:</span>
                      <Badge variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-9"
                        onClick={() => {
                          setTab("ordrar");
                          setOpenRow(o.id);
                        }}
                      >
                        Visa order
                      </Button>
                    </div>
                    {hasTotalDeviation(o) && (
                      <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Verkligt pris avviker mer än 15 % från uppskattningen — ring kunden innan
                        packning.
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Ordrar totalt" value={String(stats.total)} />
            <Kpi label="Ordrar i år" value={String(stats.thisYear)} />
            <Kpi label="Totalt ordervärde" value={cur(stats.totalValue)} />
            <Kpi label="Genomsnittlig order" value={cur(stats.average)} />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Ordermönster</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Senaste order</span>
                  <span className="font-mono tabular-nums">{shortDate(stats.last)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Första order</span>
                  <span className="font-mono tabular-nums">{shortDate(stats.first)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Orderfrekvens</span>
                  <span className="font-mono tabular-nums">
                    {stats.perMonth.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} /mån
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Avbokade ordrar</span>
                  <span className="font-mono tabular-nums">{stats.cancelled}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Ej hämtade ordrar</span>
                  <span className="font-mono tabular-nums">{stats.uncollected}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Butiker</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.stores.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen orderhistorik.</p>
                ) : (
                  stats.stores.map((s) => <ShareBar key={s.label} {...s} />)
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Brukar beställa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {stats.products.length === 0 ? (
                  <p className="text-muted-foreground">Ingen orderhistorik.</p>
                ) : (
                  stats.products.slice(0, 5).map((p) => (
                    <div key={p.name} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {qtyText(p.quantity, p.unit)} {p.unit}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <CustomerPreferencesCard customerId={customerId} readOnly={readOnly} compact />
            <CustomerNotesCard customerId={customerId} readOnly={readOnly} limit={3} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Senaste beställningarna</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Kunden har inte beställt något ännu.</p>
              ) : (
                <div>
                  <CustomerOrderRowHeader currency={customerCurrency} />
                  {orders.slice(0, 5).map((o) => (
                    <CustomerOrderRow
                      key={o.id}
                      order={o}
                      canEdit={!readOnly}
                      readOnly={readOnly}
                      open={openRow === o.id}
                      onToggle={(id) => setOpenRow((p) => (p === id ? null : id))}
                      photoCount={photoCounts?.[o.id] ?? 0}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------ Ordrar */}
        <TabsContent value="ordrar">{orderList}</TabsContent>

        {/* ------------------------------------------------------ Köpstatistik */}
        <TabsContent value="kopstatistik" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mest köpta produkter</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stats.products.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">Ingen orderhistorik.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Produkt</th>
                        <th className="px-3 py-2 text-right font-semibold">Ordrar</th>
                        <th className="px-3 py-2 text-right font-semibold">Total mängd</th>
                        <th className="px-3 py-2 text-right font-semibold">Senast köpt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.products.map((p) => (
                        <tr key={p.name} className="border-t border-border/60">
                          <td className="px-3 py-1.5">{p.name}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {p.orders}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {qtyText(p.quantity, p.unit)} {p.unit}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {shortDate(p.last)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Kategorifördelning</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ingen orderhistorik.</p>
                ) : (
                  <p className="text-xs">
                    {stats.categories
                      .map((c) => `${c.label} ${c.share} %`)
                      .join(" · ")}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Butiker</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats.stores.map((s) => (
                  <ShareBar key={s.label} {...s} />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Totalt ordervärde" value={cur(stats.totalValue)} />
            <Kpi label="Genomsnittlig order" value={cur(stats.average)} />
            <Kpi
              label="Orderfrekvens"
              value={stats.perMonth.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}
              hint="ordrar per månad"
            />
            <Kpi label="Ordrar i år" value={String(stats.thisYear)} />
          </div>
        </TabsContent>

        {/* ------------------------------------------------------ Anteckningar */}
        <TabsContent value="anteckningar" className="space-y-4">
          <CustomerNotesCard customerId={customerId} readOnly={readOnly} />
          <CustomerPreferencesCard customerId={customerId} readOnly={readOnly} />
        </TabsContent>
      </Tabs>

      <RetailCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={customer}
        storeId={customer.store_id}
      />

      {wizardOpen && (
        <CustomerOrderWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          storeId={customer.store_id ?? ""}
          currency={customerCurrency}
          initialCustomer={customer}
        />
      )}
    </div>
  );
}
