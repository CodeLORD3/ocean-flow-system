import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Save, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  quantity: String(l.quantity_packed ?? l.quantity_ordered ?? ""),
  price: String(l.price_per_unit ?? l.estimated_price_per_unit ?? ""),
  note: l.note ?? "",
  packStatus: l.pack_status,
});

/**
 * Redigering av en befintlig kundbeställning direkt i orderns rullgardin.
 * Ingen dialog och ingen sidbyte: tid, datum, uppgifter och varurader ändras
 * på plats. Packade rader är låsta i mängd eftersom uttaget är bokfört.
 */
export function InlineOrderEdit({
  order,
  onClose,
}: {
  order: CustomerOrder;
  onClose: () => void;
}) {
  const { activeUser } = useActiveUser();
  const { data: products = [] } = useProducts();
  const updateOrder = useUpdateCustomerOrder();
  const updateLine = useUpdateOrderLine();
  const addLine = useAddOrderLine();
  const deleteLine = useDeleteOrderLine();

  const [status, setStatus] = useState(order.status as string);
  const [orderType, setOrderType] = useState(order.order_type as string);
  const [wantedDate, setWantedDate] = useState(order.wanted_date);
  const [wantedTime, setWantedTime] = useState(
    order.wanted_time ? order.wanted_time.slice(0, 5) : "",
  );
  const [guestCount, setGuestCount] = useState(order.guest_count ? String(order.guest_count) : "");
  const [allergyNote, setAllergyNote] = useState(order.allergy_note ?? "");
  const [note, setNote] = useState(order.note ?? "");
  const [address, setAddress] = useState({
    street: order.delivery_street ?? "",
    postal_code: order.delivery_postal_code ?? "",
    city: order.delivery_city ?? "",
  });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [removed, setRemoved] = useState<CustomerOrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLines(
      [...(order.customer_order_lines || [])]
        .filter((l) => l.pack_status !== "struken")
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(toDraft),
    );
    setRemoved([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, (order.customer_order_lines || []).length]);

  const matches = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    if (!s) return [];
    return (products as any[])
      .filter((p) => p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s))
      .slice(0, 8);
  }, [products, productSearch]);

  const total = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.price || 0), 0);

  const patchLine = (id: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (draft: DraftLine) => {
    if (!draft.isNew) {
      const original = (order.customer_order_lines || []).find((l) => l.id === draft.id);
      if (original) setRemoved((prev) => [...prev, original]);
    }
    setLines((prev) => prev.filter((l) => l.id !== draft.id));
  };

  const addProduct = async (product: any) => {
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
    if (!wantedDate) return toast.error("Datum måste vara ifyllt");
    if (lines.some((l) => !(Number(l.quantity) > 0)))
      return toast.error("Alla rader behöver en mängd större än noll");

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
        const locked = original.pack_status === "packad";
        const patch: Record<string, unknown> = {};
        const qty = Number(draft.quantity);
        const priceValue = draft.price ? Number(draft.price) : null;
        if (!locked && qty !== Number(original.quantity_ordered)) patch.quantity_ordered = qty;
        if (locked && qty !== Number(original.quantity_packed ?? 0)) {
          patch.quantity_packed = qty;
          patch.line_total = priceValue != null ? Math.round(qty * priceValue * 100) / 100 : null;
        }
        if ((draft.note || null) !== (original.note || null)) patch.note = draft.note || null;
        if (locked) {
          if (priceValue !== (original.price_per_unit ?? null)) {
            patch.price_per_unit = priceValue;
            patch.line_total = priceValue != null ? Math.round(qty * priceValue * 100) / 100 : null;
          }
        } else if (priceValue !== (original.estimated_price_per_unit ?? null)) {
          patch.estimated_price_per_unit = priceValue;
        }
        if (!locked && draft.unit !== original.unit) patch.unit = draft.unit;
        if (Object.keys(patch).length === 0) continue;
        await updateLine.mutateAsync({
          id: draft.id,
          patch,
          orderId: order.id,
          event: { type: "rad_andrad", description: `${draft.name} ändrad` },
        });
      }

      toast.success("Beställningen är uppdaterad");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara ändringarna");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-sm border border-primary/40 bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Redigerar order
        </span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClose}>
          <X className="mr-1 h-3.5 w-3.5" /> Stäng
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Datum</Label>
          <Input
            type="date"
            className="h-9 font-mono tabular-nums"
            value={wantedDate}
            onChange={(e) => setWantedDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tid</Label>
          <Input
            type="time"
            className="h-9 font-mono tabular-nums"
            value={wantedTime}
            onChange={(e) => setWantedTime(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Typ</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upphamtning">Upphämtning</SelectItem>
              <SelectItem value="leverans">Leverans</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9">
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
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Gatuadress</Label>
            <Input
              className="h-9"
              value={address.street}
              onChange={(e) => setAddress({ ...address, street: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Postnummer</Label>
            <Input
              className="h-9"
              value={address.postal_code}
              onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ort</Label>
            <Input
              className="h-9"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Antal gäster</Label>
          <Input
            type="number"
            inputMode="numeric"
            className="h-9 font-mono tabular-nums"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Allergi</Label>
          <Input
            className="h-9"
            value={allergyNote}
            onChange={(e) => setAllergyNote(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notering</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Varor</Label>
        <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
          {lines.map((l) => {
            const locked = l.packStatus === "packad";
            return (
              <li key={l.id} className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.name}</span>
                  {locked && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Lock className="h-3 w-3" /> {LINE_PACK_LABELS.packad}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeLine(l)}
                    aria-label="Ta bort rad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <Input
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    className="h-8 font-mono text-xs tabular-nums"
                    value={l.quantity}
                    onChange={(e) => patchLine(l.id, { quantity: e.target.value })}
                    aria-label={locked ? "Vägd vikt" : "Mängd"}
                  />
                  <Input
                    className="h-8 text-xs"
                    value={l.unit}
                    disabled={locked}
                    onChange={(e) => patchLine(l.id, { unit: e.target.value })}
                    aria-label="Enhet"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="h-8 font-mono text-xs tabular-nums"
                    placeholder="kr/enhet"
                    value={l.price}
                    onChange={(e) => patchLine(l.id, { price: e.target.value })}
                    aria-label="Pris per enhet"
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Notering"
                    value={l.note}
                    onChange={(e) => patchLine(l.id, { note: e.target.value })}
                    aria-label="Radnotering"
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-sm"
            placeholder="Lägg till vara — sök namn eller artikelnummer"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>
        {productSearch.trim() && (
          <div className="space-y-1 rounded-sm border border-border bg-card p-1.5">
            {matches.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0 truncate">{p.name}</span>
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
            <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={addFreeText}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Lägg till "{productSearch.trim()}" som fritext
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-card p-2 text-sm">
        <span className="text-xs text-muted-foreground">Summa</span>
        <span className="font-mono text-sm font-semibold tabular-nums">{nf(total)} kr</span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
          <Save className="mr-1 h-3.5 w-3.5" /> Spara ändringar
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
          Avbryt
        </Button>
      </div>
    </div>
  );
}
