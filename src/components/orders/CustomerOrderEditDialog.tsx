import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useProducts } from "@/hooks/useProducts";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import {
  useUpdateCustomerOrder,
  useUpdateOrderLine,
  useAddOrderLine,
  useDeleteOrderLine,
  fetchTodaysPrice,
} from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  CustomerOrderLine,
  ORDER_STATUS_LABELS,
  LINE_PACK_LABELS,
} from "@/lib/customerOrders";

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

interface DraftLine {
  id: string;
  name: string;
  unit: string;
  quantity: string;
  price: string;
  note: string;
  packStatus: string;
  isNew?: boolean;
  productId?: string | null;
  isFreeText?: boolean;
}

const toDraft = (l: CustomerOrderLine): DraftLine => ({
  id: l.id,
  name: (l.products?.name || l.free_text_name || "Vara") as string,
  unit: l.unit || "kg",
  quantity: String(l.quantity_ordered ?? ""),
  price: String(l.estimated_price_per_unit ?? l.price_per_unit ?? ""),
  note: l.note ?? "",
  packStatus: l.pack_status,
});

/**
 * Redigerar en befintlig kundbeställning: tid, typ, adress, noteringar och
 * artikelrader. Packade rader är låsta eftersom uttaget redan är bokfört i
 * lagerboken – de kan bara strykas.
 */
export function CustomerOrderEditDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: CustomerOrder | null;
}) {
  const { activeUser } = useActiveUser();
  const { data: products = [] } = useProducts();
  const updateOrder = useUpdateCustomerOrder();
  const updateLine = useUpdateOrderLine();
  const addLine = useAddOrderLine();
  const deleteLine = useDeleteOrderLine();

  const [status, setStatus] = useState("ny");
  const [orderType, setOrderType] = useState("upphamtning");
  const [wantedDate, setWantedDate] = useState("");
  const [wantedTime, setWantedTime] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [allergyNote, setAllergyNote] = useState("");
  const [note, setNote] = useState("");
  const [address, setAddress] = useState({ street: "", postal_code: "", city: "" });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [removed, setRemoved] = useState<CustomerOrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setStatus(order.status);
    setOrderType(order.order_type);
    setWantedDate(order.wanted_date);
    setWantedTime(order.wanted_time ? order.wanted_time.slice(0, 5) : "");
    setGuestCount(order.guest_count ? String(order.guest_count) : "");
    setAllergyNote(order.allergy_note ?? "");
    setNote(order.note ?? "");
    setAddress({
      street: order.delivery_street ?? "",
      postal_code: order.delivery_postal_code ?? "",
      city: order.delivery_city ?? "",
    });
    setLines(
      [...(order.customer_order_lines || [])]
        .filter((l) => l.pack_status !== "struken")
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(toDraft),
    );
    setRemoved([]);
    setProductSearch("");
  }, [open, order]);

  const matches = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    if (!s) return [];
    return (products as any[])
      .filter((p) => p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s))
      .slice(0, 8);
  }, [products, productSearch]);

  const total = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * Number(l.price || 0),
    0,
  );

  const patchLine = (id: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (draft: DraftLine) => {
    if (!draft.isNew) {
      const original = (order?.customer_order_lines || []).find((l) => l.id === draft.id);
      if (original) setRemoved((prev) => [...prev, original]);
    }
    setLines((prev) => prev.filter((l) => l.id !== draft.id));
  };

  const addProduct = async (product: any) => {
    if (!order) return;
    const price = await fetchTodaysPrice(product.id, order.store_id);
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: product.name,
        unit: product.unit || "kg",
        quantity: "1",
        price: price ? String(price) : "",
        note: "",
        packStatus: "opackad",
        isNew: true,
        productId: product.id,
      },
    ]);
    setProductSearch("");
  };

  const addFreeText = () => {
    const name = productSearch.trim();
    if (!name) return;
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        unit: "kg",
        quantity: "1",
        price: "",
        note: "",
        packStatus: "opackad",
        isNew: true,
        isFreeText: true,
      },
    ]);
    setProductSearch("");
  };

  const save = async () => {
    if (!order) return;
    if (!wantedDate) {
      toast.error("Datum måste vara ifyllt");
      return;
    }
    if (lines.some((l) => !(Number(l.quantity) > 0))) {
      toast.error("Alla rader behöver en mängd större än noll");
      return;
    }
    setSaving(true);
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        patch: {
          status,
          order_type: orderType,
          wanted_date: wantedDate,
          wanted_time: wantedTime || null,
          guest_count: guestCount ? Number(guestCount) : null,
          allergy_note: allergyNote || null,
          note: note || null,
          delivery_street: orderType === "leverans" ? address.street || null : null,
          delivery_postal_code: orderType === "leverans" ? address.postal_code || null : null,
          delivery_city: orderType === "leverans" ? address.city || null : null,
          estimated_total: Math.round(total * 100) / 100,
        },
        event: {
          type: "andrad",
          description: "Order redigerad",
          by: activeUser ? `${activeUser.first_name} ${activeUser.last_name}`.trim() : null,
        },
      });

      for (const draft of removed) {
        await deleteLine.mutateAsync({ line: draft, orderId: order.id });
      }

      for (const draft of lines) {
        if (draft.isNew) {
          await addLine.mutateAsync({
            order,
            line: {
              product_id: draft.productId ?? null,
              free_text_name: draft.isFreeText ? draft.name : null,
              is_free_text: !!draft.isFreeText,
              quantity_ordered: Number(draft.quantity),
              unit: draft.unit,
              estimated_price_per_unit: draft.price ? Number(draft.price) : null,
              note: draft.note || null,
            } as any,
          });
          continue;
        }
        const original = (order.customer_order_lines || []).find((l) => l.id === draft.id);
        if (!original) continue;
        const patch: Record<string, unknown> = {};
        if (Number(draft.quantity) !== Number(original.quantity_ordered))
          patch.quantity_ordered = Number(draft.quantity);
        if ((draft.note || null) !== (original.note || null)) patch.note = draft.note || null;
        const priceValue = draft.price ? Number(draft.price) : null;
        if (priceValue !== (original.estimated_price_per_unit ?? null))
          patch.estimated_price_per_unit = priceValue;
        if (draft.unit !== original.unit) patch.unit = draft.unit;
        if (Object.keys(patch).length === 0) continue;
        await updateLine.mutateAsync({
          id: draft.id,
          patch,
          orderId: order.id,
          event: { type: "rad_andrad", description: `${draft.name} ändrad` },
        });
      }

      toast.success("Beställningen är uppdaterad");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara ändringarna");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redigera {order.order_number}</DialogTitle>
          <DialogDescription>
            {order.customers_retail?.name || order.customer_name_snapshot || "Kund"} · ändra tid,
            uppgifter och varor. Packade rader kan bara strykas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input
                type="date"
                className="h-11"
                value={wantedDate}
                onChange={(e) => setWantedDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tid</Label>
              <Input
                type="time"
                className="h-11"
                value={wantedTime}
                onChange={(e) => setWantedTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upphamtning">Upphämtning</SelectItem>
                  <SelectItem value="leverans">Leverans</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_STATUS_LABELS)
                    .filter(([k]) => k !== "avbruten")
                    .map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {orderType === "leverans" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label>Gatuadress</Label>
                <Input
                  className="h-11"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Postnummer</Label>
                <Input
                  className="h-11"
                  value={address.postal_code}
                  onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Ort</Label>
                <Input
                  className="h-11"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Antal gäster</Label>
              <Input
                type="number"
                inputMode="numeric"
                className="h-11"
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Allergi</Label>
              <Input
                className="h-11"
                value={allergyNote}
                onChange={(e) => setAllergyNote(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notering</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Varor</Label>
            <div className="space-y-2">
              {lines.map((l) => {
                const locked = l.packStatus === "packad";
                return (
                  <div key={l.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                      {locked && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Lock className="h-3 w-3" /> {LINE_PACK_LABELS.packad}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive"
                        onClick={() => removeLine(l)}
                        aria-label="Ta bort rad"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Input
                        type="number"
                        step="0.001"
                        inputMode="decimal"
                        className="h-11 font-mono tabular-nums"
                        value={l.quantity}
                        disabled={locked}
                        onChange={(e) => patchLine(l.id, { quantity: e.target.value })}
                        aria-label="Mängd"
                      />
                      <Input
                        className="h-11"
                        value={l.unit}
                        disabled={locked}
                        onChange={(e) => patchLine(l.id, { unit: e.target.value })}
                        aria-label="Enhet"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className="h-11 font-mono tabular-nums"
                        placeholder="kr/enhet"
                        value={l.price}
                        disabled={locked}
                        onChange={(e) => patchLine(l.id, { price: e.target.value })}
                        aria-label="Pris per enhet"
                      />
                      <Input
                        className="h-11"
                        placeholder="Notering"
                        value={l.note}
                        onChange={(e) => patchLine(l.id, { note: e.target.value })}
                        aria-label="Radnotering"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder="Lägg till vara — sök namn eller artikelnummer"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch.trim() && (
              <div className="space-y-1 rounded-md border border-border p-1.5">
                {matches.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 truncate">{p.name}</span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                <Button variant="outline" className="h-10 w-full" onClick={addFreeText}>
                  <Plus className="mr-2 h-4 w-4" /> Lägg till "{productSearch.trim()}" som fritext
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/50 p-2.5 text-sm">
            <span className="text-muted-foreground">Uppskattad summa</span>
            <span className="font-mono text-base font-semibold tabular-nums">{nf(total)} kr</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button className="h-12" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> Spara ändringar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
