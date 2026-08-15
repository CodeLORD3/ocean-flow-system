import { useMemo, useRef, useState } from "react";
import { Search, Image as ImageIcon, Loader2, Save, Upload, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import {
  BookingProduct,
  useBookingProducts,
  useUpdateBookingProduct,
} from "@/hooks/useBookingAdmin";

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const defaultStep = (p: BookingProduct) =>
  p.booking_step != null ? Number(p.booking_step) : p.unit?.toLowerCase() === "st" ? 1 : 0.5;

/**
 * Bokningssortiment — vad kunden ser på bokafiskskaldjur.se.
 *
 * Listan samlar de bokningsbara produkterna först med snabbavflaggning direkt
 * i raden, och resten av sortimentet under för att kunna flaggas på.
 */
export default function BookingAssortment() {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useBookingProducts(search);
  const update = useUpdateBookingProduct();

  const [edit, setEdit] = useState<BookingProduct | null>(null);
  const [form, setForm] = useState({
    booking_display_name: "",
    booking_circa_price: "",
    booking_step: "",
    booking_lead_days: "",
    booking_volume_alarm: "",
    image_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bookable = useMemo(() => products.filter((p) => p.bookable_online), [products]);
  const rest = useMemo(() => products.filter((p) => !p.bookable_online), [products]);

  const openEdit = (p: BookingProduct) => {
    setEdit(p);
    setForm({
      booking_display_name: p.booking_display_name ?? "",
      booking_circa_price: p.booking_circa_price != null ? String(p.booking_circa_price) : "",
      booking_step: p.booking_step != null ? String(p.booking_step) : "",
      booking_lead_days: p.booking_lead_days != null ? String(p.booking_lead_days) : "",
      booking_volume_alarm: p.booking_volume_alarm != null ? String(p.booking_volume_alarm) : "",
      image_url: p.image_url ?? "",
    });
  };

  const toggleBookable = (p: BookingProduct, next: boolean) =>
    update.mutate(
      { id: p.id, name: p.name, bookable_online: next },
      {
        onSuccess: () =>
          toast({
            title: next ? "Produkten visas på bokningssidan" : "Produkten är avflaggad",
            description: p.booking_display_name || p.name,
          }),
        onError: (e: any) =>
          toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );

  const uploadImage = async (file: File) => {
    if (!edit) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const key = `booking-products/${edit.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(key, compressed, { upsert: true, contentType: compressed.type });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(key);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast({
        title: "Bilden uppladdad",
        description: `Komprimerad till ${Math.round(compressed.size / 1024)} kB`,
      });
    } catch (e: any) {
      toast({ title: "Uppladdning misslyckades", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    if (!edit) return;
    update.mutate(
      {
        id: edit.id,
        name: edit.name,
        booking_display_name: form.booking_display_name.trim() || null,
        booking_circa_price: form.booking_circa_price ? Number(form.booking_circa_price) : null,
        booking_step: form.booking_step ? Number(form.booking_step) : null,
        booking_lead_days: form.booking_lead_days ? Number(form.booking_lead_days) : null,
        booking_volume_alarm: form.booking_volume_alarm ? Number(form.booking_volume_alarm) : null,
        image_url: form.image_url.trim() || null,
      } as any,
      {
        onSuccess: () => {
          toast({ title: "Bokningsuppgifter sparade", description: edit.name });
          setEdit(null);
        },
        onError: (e: any) =>
          toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );
  };

  const row = (p: BookingProduct) => (
    <div
      key={p.id}
      className="flex items-center gap-3 border-b border-grid-line px-3 py-2 last:border-b-0"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {p.image_url ? (
          <img src={p.image_url} alt={p.booking_display_name || p.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.booking_display_name || p.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {p.booking_display_name ? `${p.name} · ` : ""}
          {p.sku} · {p.unit}
          {p.booking_circa_price != null ? ` · ca ${nf(p.booking_circa_price)} kr/${p.unit?.toLowerCase() === "st" ? "st" : "kg"}` : ""}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          steg {nf(defaultStep(p), 1)}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          {Number(p.booking_lead_days ?? 1)} dg varsel
        </Badge>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => openEdit(p)}>
        Redigera
      </Button>
      <Switch
        checked={!!p.bookable_online}
        onCheckedChange={(v) => toggleBookable(p, v)}
        aria-label={`Bokningsbar online: ${p.name}`}
      />
    </div>
  );

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="h-5 w-5 text-primary" /> Bokningssortiment
        </h1>
        <p className="text-xs text-muted-foreground">
          Endast produkter med reglaget på visas på bokafiskskaldjur.se. Priset är ett cirkapris —
          kunden betalar efter vägd vara i butiken.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Sök produkt, visningsnamn eller artikelnummer"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Bokningsbara produkter <Badge variant="secondary">{bookable.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Läser sortimentet…</p>
          ) : bookable.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Ingen produkt är bokningsbar ännu. Slå på reglaget nedan för de varor kunden ska kunna
              förboka.
            </p>
          ) : (
            bookable.map(row)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Övrigt sortiment</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rest.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Inga fler produkter matchar sökningen.</p>
          ) : (
            rest.slice(0, 200).map(row)
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Bokningsuppgifter — {edit?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Visningsnamn på bokningssidan</Label>
              <Input
                className="h-9"
                placeholder={edit?.name}
                value={form.booking_display_name}
                onChange={(e) => setForm((f) => ({ ...f, booking_display_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Cirkapris (kr)</Label>
                <Input
                  className="h-9 font-mono tabular-nums"
                  type="number"
                  step="0.01"
                  value={form.booking_circa_price}
                  onChange={(e) => setForm((f) => ({ ...f, booking_circa_price: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Steg</Label>
                <Input
                  className="h-9 font-mono tabular-nums"
                  type="number"
                  step="0.1"
                  placeholder={edit ? String(defaultStep(edit)) : ""}
                  value={form.booking_step}
                  onChange={(e) => setForm((f) => ({ ...f, booking_step: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Varsel (dagar)</Label>
                <Input
                  className="h-9 font-mono tabular-nums"
                  type="number"
                  step="1"
                  placeholder="1"
                  value={form.booking_lead_days}
                  onChange={(e) => setForm((f) => ({ ...f, booking_lead_days: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Informationsgräns bokad volym per hämtdag</Label>
              <Input
                className="h-9 font-mono tabular-nums"
                type="number"
                step="0.5"
                placeholder="tomt = av"
                value={form.booking_volume_alarm}
                onChange={(e) => setForm((f) => ({ ...f, booking_volume_alarm: e.target.value }))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Larmar bara inköpet på Systemstatus när bokad volym för en hämtdag passerar gränsen.
                Kunden hindras aldrig — bokningssidan har inga volymtak.
              </p>
            </div>
            <div>
              <Label className="text-xs">Bild</Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {form.image_url ? (
                    <img src={form.image_url} alt="Produktbild" className="h-full w-full object-cover" / loading="lazy" decoding="async">
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    className="h-9 text-xs"
                    placeholder="https://…"
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Ladda upp bild (komprimeras)
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEdit(null)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={save} disabled={update.isPending}>
              <Save className="mr-2 h-4 w-4" /> Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
