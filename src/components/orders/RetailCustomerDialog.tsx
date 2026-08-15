import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCreateRetailCustomer, useUpdateRetailCustomer } from "@/hooks/useCustomerOrders";
import { RetailCustomer } from "@/lib/customerOrders";

const empty = {
  name: "",
  first_name: "",
  last_name: "",
  nickname: "",
  phone: "",
  email: "",
  street: "",
  postal_code: "",
  city: "",
  note: "",
  is_company: false,
  company_name: "",
  org_number: "",
  contact_reference: "",
};

/**
 * Redigeringsmodalen för butikskunder. Delas av Kundregistret och kundkortet
 * så att det bara finns ett formulär för kunduppgifterna.
 */
export function RetailCustomerDialog({
  open,
  onOpenChange,
  editing,
  storeId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RetailCustomer | null;
  storeId?: string | null;
  /** Anropas med den nyskapade kunden, används av orderflödet för autoval. */
  onCreated?: (customer: RetailCustomer) => void;
}) {
  const create = useCreateRetailCustomer();
  const update = useUpdateRetailCustomer();

  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    if (!editing) return setForm(empty);
    setForm({
      name: editing.name,
      first_name: editing.first_name || "",
      last_name: editing.last_name || "",
      nickname: (editing as any).nickname || "",
      phone: editing.phone || "",
      email: editing.email || "",
      street: editing.street || "",
      postal_code: editing.postal_code || "",
      city: editing.city || "",
      note: editing.note || "",
      is_company: !!editing.is_company,
      company_name: editing.company_name || "",
      org_number: editing.org_number || "",
      contact_reference: editing.contact_reference || "",
    });
  }, [open, editing]);

  const save = async () => {
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    if (form.is_company) {
      if (!form.company_name.trim()) return toast.error("Organisationen behöver ett namn.");
    } else if (!first || !last) {
      return toast.error("Ange både förnamn och efternamn.");
    }
    const displayName = form.is_company
      ? form.company_name.trim()
      : [first, last].filter(Boolean).join(" ");
    const payload = {
      ...form,
      first_name: first || null,
      last_name: last || null,
      nickname: form.nickname.trim() || null,
      // Originalnamnet behålls på befintliga poster, nya får det sammansatta namnet.
      name: editing ? editing.name : displayName,
      name_review_needed: false,
      company_name: form.is_company ? form.company_name.trim() || null : null,
      org_number: form.is_company ? form.org_number.trim() || null : null,
      contact_reference: form.is_company ? form.contact_reference.trim() || null : null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload } as any);
      else {
        const created = await create.mutateAsync({ ...payload, store_id: storeId } as any);
        if (created) onCreated?.(created);
      }
      toast.success("Kunden är sparad.");
      onOpenChange(false);

    } catch (e: any) {
      toast.error(e.message || "Kunden kunde inte sparas.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Redigera kund" : "Ny kund"}</DialogTitle>
          <DialogDescription>
            Uppgifterna är personuppgifter och syns bara i din butik.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="reg-is-company">Organisation</Label>
              <p className="text-xs text-muted-foreground">
                Klubb, förening eller företag. Hela namnet ligger i organisationsnamnet och
                förnamn/efternamn avser kontaktpersonen.
              </p>
            </div>
            <Switch
              id="reg-is-company"
              checked={form.is_company}
              onCheckedChange={(v) => setForm({ ...form, is_company: v })}
            />
          </div>
          {form.is_company && (
            <>
              <div>
                <Label>Organisationsnamn</Label>
                <Input
                  className="h-12"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Org.nummer</Label>
                <Input
                  className="h-12"
                  value={form.org_number}
                  onChange={(e) => setForm({ ...form, org_number: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Referens/kontaktperson</Label>
                <Input
                  className="h-12"
                  value={form.contact_reference}
                  onChange={(e) => setForm({ ...form, contact_reference: e.target.value })}
                />
              </div>
            </>
          )}

          <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kunduppgifter
          </h4>
          <div>

            <Label>
              Förnamn {form.is_company && <span className="text-muted-foreground">(valfritt)</span>}
            </Label>
            <Input
              className="h-12"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </div>
          <div>
            <Label>
              Efternamn {form.is_company && <span className="text-muted-foreground">(valfritt)</span>}
            </Label>
            <Input
              className="h-12"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Smeknamn (valfritt)</Label>
            <Input
              className="h-12"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </div>
          {editing && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Originalnamn (oförändrat): {editing.name || "—"}
            </div>
          )}

          <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kontaktinformation
          </h4>
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
            <Input
              className="h-12"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adress
          </h4>
          <div className="sm:col-span-2">

            <Label>Gata</Label>
            <Input
              className="h-12"
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
            />
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
            <Input
              className="h-12"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Anteckning
          </h4>
          <div className="sm:col-span-2">
            <Label>Anteckning (t.ex. föredraget kontaktsätt eller hämtningsönskemål)</Label>

            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button className="h-12" onClick={save}>
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
