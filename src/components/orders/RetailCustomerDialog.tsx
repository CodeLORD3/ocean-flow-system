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

/** Gemensam etikettstil för de små rubrikerna mellan fältgrupperna. */
const sectionClass =
  "sm:col-span-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Redigeringsmodalen för butikskunder. Delas av Kundregistret och kundkortet
 * så att det bara finns ett formulär för kunduppgifterna.
 *
 * Mobil: dialogen fyller skärmen, fälten skrollar och spara/avbryt ligger kvar
 * längst ned så att man aldrig behöver skrolla för att spara.
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
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowMore(!!editing);
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

  const saving = create.isPending || update.isPending;

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
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-left sm:px-6">
          <DialogTitle className="text-base sm:text-lg">
            {editing ? "Redigera kund" : "Ny kund"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Uppgifterna är personuppgifter och syns bara i din butik.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 sm:col-span-2">
              <div className="min-w-0">
                <Label htmlFor="reg-is-company">Organisation</Label>
                <p className="text-xs text-muted-foreground">
                  Klubb, förening eller företag. Kontaktpersonens namn läggs i
                  förnamn/efternamn.
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
                <div className="sm:col-span-2">
                  <Label>Organisationsnamn</Label>
                  <Input
                    className="h-12 text-base"
                    autoCapitalize="words"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Org.nummer</Label>
                  <Input
                    className="h-12 text-base"
                    inputMode="numeric"
                    value={form.org_number}
                    onChange={(e) => setForm({ ...form, org_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Referens/kontaktperson</Label>
                  <Input
                    className="h-12 text-base"
                    autoCapitalize="words"
                    value={form.contact_reference}
                    onChange={(e) => setForm({ ...form, contact_reference: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <Label>
                Förnamn{" "}
                {form.is_company && <span className="text-muted-foreground">(valfritt)</span>}
              </Label>
              <Input
                className="h-12 text-base"
                autoCapitalize="words"
                autoComplete="given-name"
                enterKeyHint="next"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div>
              <Label>
                Efternamn{" "}
                {form.is_company && <span className="text-muted-foreground">(valfritt)</span>}
              </Label>
              <Input
                className="h-12 text-base"
                autoCapitalize="words"
                autoComplete="family-name"
                enterKeyHint="next"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                className="h-12 text-base"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>E-post</Label>
              <Input
                className="h-12 text-base"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                enterKeyHint="done"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            {!showMore && (
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:col-span-2"
                onClick={() => setShowMore(true)}
              >
                Visa fler fält (adress, smeknamn, anteckning)
              </Button>
            )}

            {showMore && (
              <>
                <div className="sm:col-span-2">
                  <Label>Smeknamn (valfritt)</Label>
                  <Input
                    className="h-12 text-base"
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  />
                </div>
                {editing && (
                  <div className="text-xs text-muted-foreground sm:col-span-2">
                    Originalnamn (oförändrat): {editing.name || "—"}
                  </div>
                )}

                <h4 className={sectionClass}>Adress</h4>
                <div className="sm:col-span-2">
                  <Label>Gata</Label>
                  <Input
                    className="h-12 text-base"
                    autoComplete="address-line1"
                    value={form.street}
                    onChange={(e) => setForm({ ...form, street: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Postnummer</Label>
                  <Input
                    className="h-12 text-base"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ort</Label>
                  <Input
                    className="h-12 text-base"
                    autoCapitalize="words"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>

                <h4 className={sectionClass}>Anteckning</h4>
                <div className="sm:col-span-2">
                  <Label>Anteckning (t.ex. kontaktsätt eller hämtningsönskemål)</Label>
                  <Textarea
                    className="text-base"
                    rows={3}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button
            variant="outline"
            className="h-12 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
          <Button className="h-12 w-full sm:w-auto" disabled={saving} onClick={save}>
            {saving ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
