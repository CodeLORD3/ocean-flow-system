import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Edit, Trash2, Users, Mail, Phone, MapPin, Clock,
  Save, Camera, Store as StoreIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, Customer } from "@/hooks/useCustomers";
import { useStores, useUpdateStore, Store } from "@/hooks/useStores";
import { useSite } from "@/contexts/SiteContext";
import { supabase } from "@/integrations/supabase/client";

/* ===== Wholesale view: Store cards (from Stores page) ===== */
function WholesaleCustomers() {
  const { data: stores = [], isLoading } = useStores(true);
  const updateStore = useUpdateStore();
  const { toast } = useToast();
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [hoveredStore, setHoveredStore] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [form, setForm] = useState({
    name: "", address: "", city: "", phone: "", manager: "", hours: "", sqm: 0,
  });

  const openEdit = (store: Store) => {
    setEditStore(store);
    setForm({
      name: store.name, address: store.address || "", city: store.city,
      phone: store.phone || "", manager: store.manager || "",
      hours: store.hours || "", sqm: store.sqm || 0,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, storeId: string, storeName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `stores/${storeId}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (uploadError) { toast({ title: "Fel", description: "Kunde inte ladda upp logotypen", variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    updateStore.mutate({ id: storeId, logo_url: urlData.publicUrl }, {
      onSuccess: () => toast({ title: "Logotyp uppdaterad", description: storeName }),
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
    if (fileInputRefs.current[storeId]) fileInputRefs.current[storeId]!.value = "";
  };

  const handleSave = () => {
    if (!editStore) return;
    updateStore.mutate({
      id: editStore.id, name: form.name, address: form.address || null,
      city: form.city, phone: form.phone || null, manager: form.manager || null,
      hours: form.hours || null, sqm: form.sqm || null,
    }, {
      onSuccess: () => { toast({ title: "Kund uppdaterad", description: form.name }); setEditStore(null); },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Kunder
        </h2>
        <p className="text-xs text-muted-foreground">Butiker kopplade till grossisten</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Kunder</p><p className="text-xl font-heading font-bold text-foreground">{stores.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Städer</p><p className="text-xl font-heading font-bold text-foreground">{new Set(stores.map(s => s.city)).size}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total yta</p><p className="text-xl font-heading font-bold text-foreground">{stores.reduce((s, st) => s + (st.sqm || 0), 0)} m²</p></CardContent></Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laddar kunder…</p>
      ) : stores.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">Inga kunder skapade ännu.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card key={store.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg cursor-pointer overflow-hidden bg-primary/10"
                      onClick={() => fileInputRefs.current[store.id]?.click()}
                      onMouseEnter={() => setHoveredStore(store.id)}
                      onMouseLeave={() => setHoveredStore(null)}
                      title="Klicka för att byta logotyp"
                    >
                      {store.logo_url ? (
                        <img src={store.logo_url} alt={store.name} className="h-full w-full object-contain" />
                      ) : (
                        <StoreIcon className="h-5 w-5 text-primary" />
                      )}
                      {hoveredStore === store.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                          <Camera className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <input
                        ref={(el) => (fileInputRefs.current[store.id] = el)}
                        type="file" accept="image/*" className="hidden"
                        onChange={(e) => handleLogoUpload(e, store.id, store.name)}
                      />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-foreground text-sm">{store.name}</h3>
                      {store.manager && <p className="text-[10px] text-muted-foreground">{store.manager}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{store.city}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(store)}>
                      <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {store.address && <div className="flex items-start gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span className="text-[10px]">{store.address}</span></div>}
                  {store.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3 shrink-0 text-primary/60" /><span className="text-[10px]">{store.phone}</span></div>}
                  {store.hours && <div className="flex items-start gap-1.5 text-muted-foreground"><Clock className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" /><span className="text-[10px]">{store.hours}</span></div>}
                  {store.sqm ? <div className="flex items-center gap-1.5 text-muted-foreground"><span className="text-[10px]">📐 {store.sqm} m²</span></div> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editStore} onOpenChange={(open) => !open && setEditStore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm font-heading">Redigera kund</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Namn</Label><Input className="h-8 text-xs" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Stad</Label><Input className="h-8 text-xs" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div><Label className="text-xs">Yta (m²)</Label><Input className="h-8 text-xs" type="number" value={form.sqm} onChange={e => setForm(f => ({ ...f, sqm: Number(e.target.value) }))} /></div>
            </div>
            <div><Label className="text-xs">Adress</Label><Input className="h-8 text-xs" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Telefon</Label><Input className="h-8 text-xs" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label className="text-xs">Ansvarig</Label><Input className="h-8 text-xs" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Öppettider</Label><Input className="h-8 text-xs" placeholder="t.ex. Mån-Fre 08-17" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditStore(null)} className="text-xs">Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={updateStore.isPending} className="text-xs gap-1.5"><Save className="h-3 w-3" /> Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ===== Shop view: Original customer table ===== */
function ShopCustomers() {
  const { toast } = useToast();
  const { activeStoreId } = useSite();
  const { data: allCustomers = [], isLoading } = useCustomers();
  const customers = allCustomers.filter(c => c.store_id === activeStoreId);
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", city: "", contact_person: "", notes: "" });
  const setField = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditId(null); setForm({ name: "", email: "", phone: "", address: "", city: "", contact_person: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (c: Customer) => { setEditId(c.id); setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "", city: c.city || "", contact_person: c.contact_person || "", notes: c.notes || "" }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.name) return;
    const payload = { name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null, city: form.city || null, contact_person: form.contact_person || null, notes: form.notes || null, store_id: activeStoreId };
    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, { onSuccess: () => { toast({ title: "Kund uppdaterad", description: form.name }); setDialogOpen(false); }, onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }) });
    } else {
      createCustomer.mutate(payload, { onSuccess: () => { toast({ title: "Kund tillagd", description: form.name }); setDialogOpen(false); }, onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }) });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCustomer.mutate(deleteTarget.id, { onSuccess: () => { toast({ title: "Kund borttagen", description: deleteTarget.name }); setDeleteTarget(null); }, onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }) });
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Kunder</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Hantera specialkunder kopplade till butiken.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}><Plus className="h-3.5 w-3.5" /> Lägg till kund</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Totalt kunder</p><p className="text-xl font-heading font-bold text-foreground">{customers.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Med e-post</p><p className="text-xl font-heading font-bold text-foreground">{customers.filter(c => c.email).length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Städer</p><p className="text-xl font-heading font-bold text-foreground">{new Set(customers.map(c => c.city).filter(Boolean)).size}</p></CardContent></Card>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Sök kund..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-left font-medium text-muted-foreground">NAMN</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">KONTAKTPERSON</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">E-POST</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">TELEFON</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">STAD</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">ADRESS</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">ÅTGÄRD</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{customers.length === 0 ? "Inga kunder ännu. Klicka \"Lägg till kund\" för att börja." : "Inga kunder matchar sökningen."}</td></tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium text-foreground">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.contact_person || "–"}</td>
                    <td className="p-3 text-muted-foreground">{c.email || "–"}</td>
                    <td className="p-3 text-muted-foreground">{c.phone || "–"}</td>
                    <td className="p-3 text-muted-foreground">{c.city || "–"}</td>
                    <td className="p-3 text-muted-foreground text-[10px]">{c.address || "–"}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera kund" : "Lägg till kund"}</DialogTitle>
            <DialogDescription className="text-xs">Fyll i kunduppgifterna nedan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Företagsnamn / Namn *</Label><Input value={form.name} onChange={e => setField("name", e.target.value)} className="h-8 text-xs" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Kontaktperson</Label><Input value={form.contact_person} onChange={e => setField("contact_person", e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">E-post</Label><Input value={form.email} onChange={e => setField("email", e.target.value)} className="h-8 text-xs" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Telefon</Label><Input value={form.phone} onChange={e => setField("phone", e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stad *</Label>
                <select value={form.city} onChange={e => setField("city", e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">Välj stad...</option>
                  <option value="Göteborg">Göteborg</option>
                  <option value="Stockholm">Stockholm</option>
                  <option value="Zürich">Zürich</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Adress</Label><Input value={form.address} onChange={e => setField("address", e.target.value)} className="h-8 text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Anteckningar</Label><Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} className="text-xs min-h-[60px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kund?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">Är du säker på att du vill ta bort <span className="font-semibold">{deleteTarget?.name}</span>? Detta kan inte ångras.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

/* ===== Main export: switches by portal ===== */
export default function Customers() {
  const { site } = useSite();
  return site === "wholesale" ? <WholesaleCustomers /> : <ShopCustomers />;
}
