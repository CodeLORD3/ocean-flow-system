import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, History } from "lucide-react";
import { CustomerHistoryDialog } from "@/components/orders/CustomerHistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import {
  useAnonymizeRetailCustomer,
  useCreateRetailCustomer,
  useCustomerOrders,
  useRetailCustomers,
  useUpdateRetailCustomer,
} from "@/hooks/useCustomerOrders";
import { RetailCustomer } from "@/lib/customerOrders";

const empty = {
  name: "",
  phone: "",
  email: "",
  street: "",
  postal_code: "",
  city: "",
  note: "",
};

/** Kundregister för privatkunder. Skilt från B2B-kunderna i /customers. */
export function RetailCustomerRegistry({
  storeId,
  readOnly,
}: {
  storeId: string | null;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: customers = [], isLoading } = useRetailCustomers(storeId, search);
  const { data: orders = [] } = useCustomerOrders({ storeId });
  const create = useCreateRetailCustomer();
  const update = useUpdateRetailCustomer();
  const anonymize = useAnonymizeRetailCustomer();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RetailCustomer | null>(null);
  const [form, setForm] = useState(empty);
  const [historyCustomer, setHistoryCustomer] = useState<RetailCustomer | null>(null);


  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (c: RetailCustomer) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      street: c.street || "",
      postal_code: c.postal_code || "",
      city: c.city || "",
      note: c.note || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Kunden behöver ett namn.");
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...form } as any);
      else await create.mutateAsync({ ...form, store_id: storeId } as any);
      toast.success("Kunden är sparad.");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Kunden kunde inte sparas.");
    }
  };

  const historyFor = (id: string) => orders.filter((o) => o.customer_id === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Sök namn, telefon eller e-post"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!readOnly && (
          <Button className="h-11" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Ny kund
          </Button>
        )}
      </div>

      {!isLoading && customers.length === 0 && (
        <EmptyState
          title="Inga privatkunder ännu"
          description="Kunder läggs upp när du tar emot första beställningen, eller här direkt."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => {
          const history = historyFor(c.id);
          const uncollected = history.filter((o) => o.status === "packad").length;
          const common = new Map<string, number>();
          for (const o of history)
            for (const l of o.customer_order_lines || []) {
              const n = (l.products?.name || l.free_text_name) as string | undefined;
              if (n) common.set(n, (common.get(n) || 0) + 1);
            }
          const top = Array.from(common.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([n]) => n);

          return (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.street, c.postal_code, c.city].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Radera kundens personuppgifter? Ordrarna behålls anonymiserade för bokföringen.",
                            )
                          )
                            return;
                          await anonymize.mutateAsync(c.id);
                          toast.success("Kunduppgifterna är raderade.");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                {top.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Brukar beställa: </span>
                    {top.join(", ")}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{history.length} order</span>
                  {uncollected > 0 && <span>{uncollected} väntar på hämtning</span>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-9"
                    onClick={() => setHistoryCustomer(c)}
                  >
                    <History className="mr-1 h-4 w-4" /> Historik
                  </Button>
                </div>

              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera kund" : "Ny kund"}</DialogTitle>
            <DialogDescription>Uppgifterna är personuppgifter och syns bara i din butik.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Namn</Label>
              <Input className="h-12" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                className="h-12"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>E-post</Label>
              <Input className="h-12" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Gata</Label>
              <Input className="h-12" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
            </div>
            <div>
              <Label>Postnummer</Label>
              <Input
                className="h-12"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
            </div>
            <div>
              <Label>Ort</Label>
              <Input className="h-12" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Anteckning</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-12" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button className="h-12" onClick={save}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerHistoryDialog
        open={!!historyCustomer}
        onOpenChange={(v) => !v && setHistoryCustomer(null)}
        customerName={historyCustomer?.name || ""}
        orders={historyCustomer ? historyFor(historyCustomer.id) : []}
      />
    </div>

  );
}
