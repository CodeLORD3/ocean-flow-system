import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, User, Fish, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductThumb } from "@/components/products/ProductThumb";
import { useProducts } from "@/hooks/useProducts";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import {
  useCreateCustomerOrder,
  useCreateRetailCustomer,
  useRetailCustomers,
  fetchTodaysPrice,
  NewOrderLineInput,
} from "@/hooks/useCustomerOrders";
import { RetailCustomer, shelfLifeWarning } from "@/lib/customerOrders";
import {
  useMajorHolidays,
  useSameDayOrders,
  useSpecialDays,
  useStoreOrderSettings,
} from "@/hooks/useStoreOrderSettings";
import {
  ALLERGENS,
  allergenLabel,
  checkAllergens,
  checkCapacity,
  dayWindow,
  scaleQuantity,
  weekdayName,
} from "@/lib/catering";

const nf = (v: number, d = 2) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

interface DraftLine extends NewOrderLineInput {
  key: string;
  productName: string;
  imageUrl?: string | null;
  warning?: string | null;
  locked_from_scaling?: boolean;
}

/**
 * Guidat flöde i fyra steg: kund, tid, artiklar, bekräfta.
 * En uppgift per skärm, produktbild före text, stora fält.
 */
export function CustomerOrderWizard({
  open,
  onOpenChange,
  storeId,
  storeName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  storeName?: string | null;
}) {
  const [step, setStep] = useState(1);
  const { activeUser } = useActiveUser();
  const { data: products = [] } = useProducts();
  const createOrder = useCreateCustomerOrder();
  const createCustomer = useCreateRetailCustomer();

  const [customerSearch, setCustomerSearch] = useState("");
  const { data: customers = [] } = useRetailCustomers(storeId, customerSearch);
  const [customer, setCustomer] = useState<RetailCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    street: "",
    postal_code: "",
    city: "",
    note: "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [orderType, setOrderType] = useState("upphamtning");
  const [category, setCategory] = useState("vanlig");
  const [status, setStatus] = useState("ny");
  const [wantedDate, setWantedDate] = useState(new Date().toISOString().slice(0, 10));
  const [wantedTime, setWantedTime] = useState("");
  const [source, setSource] = useState("telefon");
  const [guestCount, setGuestCount] = useState("");
  const [allergyNote, setAllergyNote] = useState("");
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [address, setAddress] = useState({ street: "", postal_code: "", city: "" });

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [pending, setPending] = useState<{ product: any; qty: string; portion: string } | null>(null);
  const [freeText, setFreeText] = useState({ name: "", qty: "", price: "" });
  const productInput = useRef<HTMLInputElement>(null);
  const qtyInput = useRef<HTMLInputElement>(null);

  /* Öppettider, kapacitetstak och storhelger för butiken */
  const { data: settings } = useStoreOrderSettings(storeId);
  const { data: specialDays = [] } = useSpecialDays(storeId);
  const { data: holidays = [] } = useMajorHolidays(storeId);
  const { data: sameDayOrders = [] } = useSameDayOrders(storeId, wantedDate);

  const capacity = useMemo(
    () =>
      checkCapacity({
        date: wantedDate,
        time: wantedTime || null,
        orderType,
        category,
        settings,
        specialDays,
        holidays,
        sameDayOrders,
      }),
    [wantedDate, wantedTime, orderType, category, settings, specialDays, holidays, sameDayOrders],
  );

  const window_ = useMemo(
    () => dayWindow({ date: wantedDate, settings, specialDays, holidays }),
    [wantedDate, settings, specialDays, holidays],
  );

  useEffect(() => {
    if (!open) {
      setStep(1);
      setCustomer(null);
      setCustomerSearch("");
      setLines([]);
      setPending(null);
      setProductSearch("");
      setWantedTime("");
      setGuestCount("");
      setAllergyNote("");
      setExcludedAllergens([]);
      setNote("");
      setStatus("ny");
      setCategory("vanlig");
      setOrderType("upphamtning");
    }
  }, [open]);

  useEffect(() => {
    if (customer) {
      setAddress({
        street: customer.street || "",
        postal_code: customer.postal_code || "",
        city: customer.city || "",
      });
      setExcludedAllergens(customer.excluded_allergens || []);
    }
  }, [customer]);

  /* Cateringrader räknas om när gästantalet ändras. Låsta rader står kvar. */
  useEffect(() => {
    const guests = Number(guestCount || 0);
    if (category !== "catering" || !guests) return;
    setLines((prev) =>
      prev.map((l) =>
        l.portion_per_guest && !l.locked_from_scaling
          ? {
              ...l,
              quantity_ordered: scaleQuantity({
                portionPerGuest: l.portion_per_guest,
                guestCount: guests,
                currentQuantity: l.quantity_ordered,
              }),
            }
          : l,
      ),
    );
  }, [guestCount, category]);

  useEffect(() => {
    if (step === 3) setTimeout(() => productInput.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    if (pending) setTimeout(() => qtyInput.current?.focus(), 50);
  }, [pending]);

  const matches = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    if (!s) return [];
    return (products as any[])
      .filter((p) => p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s))
      .slice(0, 8);
  }, [products, productSearch]);

  const estimatedTotal = lines.reduce(
    (sum, l) => sum + Number(l.quantity_ordered || 0) * Number(l.estimated_price_per_unit || 0),
    0,
  );

  const addProduct = async (product: any, quantity: number, portionPerGuest?: number | null) => {
    // Allergivarning vid artikelval — varnar, spärrar inte.
    const conflict = checkAllergens({
      productName: product.name,
      productAllergens: product.allergens,
      excluded: excludedAllergens,
    });
    if (conflict.message) {
      const ok = window.confirm(`${conflict.message}\n\nLägga till varan ändå?`);
      if (!ok) return;
    }

    const price = await fetchTodaysPrice(product.id, storeId);
    const warning = shelfLifeWarning({
      productName: product.name,
      shelfLifeDays: product.shelf_life_days,
      wantedDate,
    });
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: product.id,
        productName: product.name,
        imageUrl: product.image_url,
        quantity_ordered: quantity,
        unit: product.unit || "kg",
        estimated_price_per_unit: price,
        portion_per_guest: portionPerGuest ?? null,
        warning: conflict.message ?? warning,
      },
    ]);
    if (warning) toast.info(warning);
    setPending(null);
    setProductSearch("");
    setTimeout(() => productInput.current?.focus(), 50);
  };

  const saveCustomer = async () => {
    if (!newCustomer.name.trim()) return toast.error("Kunden behöver ett namn.");
    try {
      const created = await createCustomer.mutateAsync({
        ...newCustomer,
        store_id: storeId,
      } as any);
      setCustomer(created);
      setCreatingCustomer(false);
      toast.success("Kunden är sparad.");
    } catch (e: any) {
      toast.error(e.message || "Kunden kunde inte sparas.");
    }
  };

  const submit = async () => {
    if (!customer) return toast.error("Välj kund först.");
    if (capacity.blocking) return toast.error(capacity.blocking);

    if (lines.length === 0) return toast.error("Ordern behöver minst en rad.");
    try {
      await createOrder.mutateAsync({
        store_id: storeId,
        customer_id: customer.id,
        customer_name_snapshot: customer.name,
        customer_phone_snapshot: customer.phone,
        order_type: orderType,
        category,
        status,
        wanted_date: wantedDate,
        wanted_time: wantedTime || null,
        delivery_street: orderType === "leverans" ? address.street : null,
        delivery_postal_code: orderType === "leverans" ? address.postal_code : null,
        delivery_city: orderType === "leverans" ? address.city : null,
        guest_count: category === "catering" && guestCount ? Number(guestCount) : null,
        allergy_note: allergyNote || null,
        excluded_allergens: excludedAllergens,
        source,
        received_by_name: activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : null,
        note: note || null,
        lines: lines.map(({ key, productName, imageUrl, warning, ...l }) => l),
      });
      toast.success("Ordern är sparad.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Ordern kunde inte sparas.");
    }
  };

  const stepTitles = ["Kund", "Tid och typ", "Varor", "Bekräfta"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ny kundbeställning{storeName ? ` — ${storeName}` : ""}</DialogTitle>
          <DialogDescription>
            Steg {step} av 4: {stepTitles[step - 1]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {stepTitles.map((t, i) => (
            <div
              key={t}
              className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            {!creatingCustomer ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-12 pl-9"
                    placeholder="Sök namn eller telefon"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomer(c);
                        setStep(2);
                      }}
                      className={`w-full rounded-md border p-3 text-left hover:bg-accent ${
                        customer?.id === c.id ? "border-primary bg-accent" : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[c.phone, c.city].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {customers.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Ingen kund matchar sökningen. Lägg upp kunden nedan.
                    </p>
                  )}
                </div>
                <Button variant="outline" className="h-12 w-full" onClick={() => setCreatingCustomer(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Ny kund
                </Button>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Namn</Label>
                  <Input
                    autoFocus
                    className="h-12"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input
                    className="h-12"
                    inputMode="tel"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>E-post</Label>
                  <Input
                    className="h-12"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Gata</Label>
                  <Input
                    className="h-12"
                    value={newCustomer.street}
                    onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Postnummer</Label>
                  <Input
                    className="h-12"
                    value={newCustomer.postal_code}
                    onChange={(e) => setNewCustomer({ ...newCustomer, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ort</Label>
                  <Input
                    className="h-12"
                    value={newCustomer.city}
                    onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Anteckning (t.ex. portkod)</Label>
                  <Textarea
                    value={newCustomer.note}
                    onChange={(e) => setNewCustomer({ ...newCustomer, note: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button className="h-12 flex-1" onClick={saveCustomer}>
                    Spara kund
                  </Button>
                  <Button variant="outline" className="h-12" onClick={() => setCreatingCustomer(false)}>
                    Avbryt
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Ordertyp</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upphamtning">Upphämtning</SelectItem>
                  <SelectItem value="leverans">Leverans</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vanlig">Vanlig order</SelectItem>
                  <SelectItem value="catering">Catering</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Önskat datum</Label>
              <Input
                type="date"
                className="h-12"
                value={wantedDate}
                onChange={(e) => setWantedDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Önskad tid</Label>
              <Input
                type="time"
                className="h-12"
                value={wantedTime}
                onChange={(e) => setWantedTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Källa</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefon">Telefon</SelectItem>
                  <SelectItem value="i_butik">I butik</SelectItem>
                  <SelectItem value="epost">E-post</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ny">Ny order</SelectItem>
                  <SelectItem value="forfragan">Förfrågan (reserverar inget)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {category === "catering" && (
              <div>
                <Label>Antal gäster</Label>
                <Input
                  inputMode="numeric"
                  className="h-12"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Allergianmärkning</Label>
              <Input
                className="h-12"
                value={allergyNote}
                onChange={(e) => setAllergyNote(e.target.value)}
                placeholder="t.ex. äggallergi"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Undvik dessa allergener</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ALLERGENS.map((a) => {
                  const on = excludedAllergens.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() =>
                        setExcludedAllergens((prev) =>
                          on ? prev.filter((x) => x !== a.key) : [...prev, a.key],
                        )
                      }
                      className={`rounded-full border px-3 py-2 text-xs ${
                        on
                          ? "border-destructive bg-destructive/10 font-semibold text-destructive"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Systemet varnar när en vara innehåller något av dessa. Varning, ingen spärr.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="rounded-md bg-muted p-3 text-xs">
                {window_.closed
                  ? `Stängt ${weekdayName(wantedDate)} — ${window_.sourceLabel}`
                  : window_.open && window_.close
                    ? `Öppet ${weekdayName(wantedDate)} ${window_.open}–${window_.close} (${window_.sourceLabel})`
                    : "Öppettider är inte upplagda för butiken."}
              </div>
              {capacity.blocking && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold">
                  {capacity.blocking}
                </div>
              )}
              {capacity.warnings.map((w) => (
                <div
                  key={w}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                >
                  {w}
                </div>
              ))}
            </div>

            {orderType === "leverans" && (
              <>
                <div className="sm:col-span-2">
                  <Label>Leveransadress</Label>
                  <Input
                    className="h-12"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Postnummer</Label>
                  <Input
                    className="h-12"
                    value={address.postal_code}
                    onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ort</Label>
                  <Input
                    className="h-12"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <Label>Anteckning</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!pending ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={productInput}
                    className="h-12 pl-9"
                    placeholder="Sök produkt"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && matches[0]) {
                        e.preventDefault();
                        setPending({ product: matches[0], qty: "", portion: "" });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {matches.map((p) => {
                    const conflict = checkAllergens({
                      productName: p.name,
                      productAllergens: p.allergens,
                      excluded: excludedAllergens,
                    });
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPending({ product: p, qty: "", portion: "" })}
                        className={`flex w-full items-center gap-3 rounded-md border p-2 text-left hover:bg-accent ${
                          conflict.hits.length > 0 ? "border-destructive" : "border-border"
                        }`}
                      >
                        <ProductThumb src={p.image_url} alt={p.name} static />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.category} · {p.unit}
                            {p.retail_suggested ? ` · ${nf(Number(p.retail_suggested))} kr/${p.unit}` : ""}
                          </div>
                          {conflict.hits.length > 0 && (
                            <div className="text-xs font-semibold text-destructive">
                              Innehåller {conflict.hits.map(allergenLabel).join(", ").toLowerCase()}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <ProductThumb src={pending.product.image_url} alt={pending.product.name} static />
                    <div>
                      <div className="font-semibold">{pending.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Uppskattat pris, dagens pris gäller vid hämtning
                      </div>
                    </div>
                  </div>
                  {category === "catering" && Number(guestCount || 0) > 0 && (
                    <div>
                      <Label>
                        Portion per gäst ({pending.product.unit || "kg"}) — {guestCount} gäster
                      </Label>
                      <Input
                        inputMode="decimal"
                        className="h-12"
                        value={pending.portion}
                        onChange={(e) => {
                          const portion = e.target.value;
                          const p = Number(String(portion).replace(",", "."));
                          setPending({
                            ...pending,
                            portion,
                            qty: p ? String(Math.round(p * Number(guestCount) * 1000) / 1000) : pending.qty,
                          });
                        }}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mängden räknas om automatiskt om gästantalet ändras.
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>Antal / mängd ({pending.product.unit || "kg"})</Label>
                    <Input
                      ref={qtyInput}
                      inputMode="decimal"
                      className="h-14 text-lg"
                      value={pending.qty}
                      onChange={(e) => setPending({ ...pending, qty: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const q = Number(String(pending.qty).replace(",", "."));
                          if (!q) return toast.error("Ange en mängd.");
                          addProduct(
                            pending.product,
                            q,
                            Number(String(pending.portion).replace(",", ".")) || null,
                          );
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="h-12 flex-1"
                      onClick={() => {
                        const q = Number(String(pending.qty).replace(",", "."));
                        if (!q) return toast.error("Ange en mängd.");
                        addProduct(
                          pending.product,
                          q,
                          Number(String(pending.portion).replace(",", ".")) || null,
                        );
                      }}
                    >
                      Lägg till
                    </Button>
                    <Button variant="outline" className="h-12" onClick={() => setPending(null)}>
                      Avbryt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}


            {lines.length > 0 && (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.key} className="flex items-center gap-3 rounded-md border border-border p-2">
                    {l.is_free_text ? (
                      <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
                        <Fish className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ) : (
                      <ProductThumb src={l.imageUrl} alt={l.productName} static />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {l.productName}
                        {l.is_free_text && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Fritext
                          </Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground">
                        {nf(Number(l.quantity_ordered), 3)} {l.unit} ×{" "}
                        {l.estimated_price_per_unit != null
                          ? `${nf(Number(l.estimated_price_per_unit))} kr`
                          : "pris saknas"}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {category === "catering" && (
              <Card>
                <CardContent className="grid gap-2 p-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Fritextrad (t.ex. upplägg)</Label>
                    <Input
                      className="h-11"
                      value={freeText.name}
                      onChange={(e) => setFreeText({ ...freeText, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Antal</Label>
                    <Input
                      inputMode="decimal"
                      className="h-11"
                      value={freeText.qty}
                      onChange={(e) => setFreeText({ ...freeText, qty: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pris</Label>
                    <Input
                      inputMode="decimal"
                      className="h-11"
                      value={freeText.price}
                      onChange={(e) => setFreeText({ ...freeText, price: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 sm:col-span-4"
                    onClick={() => {
                      const q = Number(String(freeText.qty).replace(",", "."));
                      if (!freeText.name.trim() || !q) return toast.error("Fritextraden behöver namn och antal.");
                      setLines((prev) => [
                        ...prev,
                        {
                          key: crypto.randomUUID(),
                          is_free_text: true,
                          free_text_name: freeText.name.trim(),
                          productName: freeText.name.trim(),
                          quantity_ordered: q,
                          unit: "st",
                          estimated_price_per_unit: Number(String(freeText.price).replace(",", ".")) || null,
                        },
                      ]);
                      setFreeText({ name: "", qty: "", price: "" });
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Lägg till fritextrad
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <div className="text-base font-semibold">{customer?.name}</div>
                <div className="text-muted-foreground">{customer?.phone}</div>
                <div>
                  {orderType === "leverans" ? "Leverans" : "Upphämtning"} {wantedDate}
                  {wantedTime ? ` kl ${wantedTime}` : ""}
                </div>
                {orderType === "leverans" && (
                  <div className="text-muted-foreground">
                    {[address.street, address.postal_code, address.city].filter(Boolean).join(", ")}
                  </div>
                )}
                {allergyNote && <div className="font-semibold">Allergi: {allergyNote}</div>}
              </CardContent>
            </Card>
            <div className="space-y-1">
              {lines.map((l) => (
                <div key={l.key} className="flex justify-between rounded border border-border px-3 py-2 text-sm">
                  <span>{l.productName}</span>
                  <span className="font-mono tabular-nums">
                    {nf(Number(l.quantity_ordered), 3)} {l.unit}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between font-semibold">
                <span>Uppskattat pris</span>
                <span className="font-mono tabular-nums">{nf(estimatedTotal)} kr</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uppskattat pris. Dagens pris gäller vid hämtning.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" className="h-12" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Tillbaka
            </Button>
          )}
          {step < 4 ? (
            <Button
              className="h-12"
              onClick={() => {
                if (step === 1 && !customer) return toast.error("Välj eller skapa kund.");
                if (step === 2 && capacity.blocking) return toast.error(capacity.blocking);

                if (step === 3 && lines.length === 0) return toast.error("Lägg till minst en vara.");
                setStep(step + 1);
              }}
            >
              Nästa <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button className="h-12" onClick={submit} disabled={createOrder.isPending}>
              <Check className="mr-2 h-4 w-4" /> Spara order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
