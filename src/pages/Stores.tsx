import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Clock, Edit, X, Save, Camera, Store as StoreIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStores, useUpdateStore, Store } from "@/hooks/useStores";
import { supabase } from "@/integrations/supabase/client";

export default function Stores() {
  const { data: stores = [], isLoading } = useStores(true);
  const updateStore = useUpdateStore();
  const { toast } = useToast();
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [hoveredStore, setHoveredStore] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Edit form state
  const [form, setForm] = useState({
    name: "", address: "", city: "", phone: "", manager: "", hours: "", sqm: 0,
  });

  const openEdit = (store: Store) => {
    setEditStore(store);
    setForm({
      name: store.name,
      address: store.address || "",
      city: store.city,
      phone: store.phone || "",
      manager: store.manager || "",
      hours: store.hours || "",
      sqm: store.sqm || 0,
    });
  };

  const handleSave = () => {
    if (!editStore) return;
    updateStore.mutate(
      {
        id: editStore.id,
        name: form.name,
        address: form.address || null,
        city: form.city,
        phone: form.phone || null,
        manager: form.manager || null,
        hours: form.hours || null,
        sqm: form.sqm || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Butik uppdaterad", description: form.name });
          setEditStore(null);
        },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground">Butiksöversikt</h2>
        <p className="text-xs text-muted-foreground">Butiker kopplade till grossisten</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Butiker</p><p className="text-xl font-heading font-bold text-foreground">{stores.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Städer</p><p className="text-xl font-heading font-bold text-foreground">{new Set(stores.map(s => s.city)).size}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total yta</p><p className="text-xl font-heading font-bold text-foreground">{stores.reduce((s, st) => s + (st.sqm || 0), 0)} m²</p></CardContent></Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laddar butiker…</p>
      ) : stores.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">Inga butiker skapade ännu.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card key={store.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-foreground text-sm">{store.name}</h3>
                    {store.manager && <p className="text-[10px] text-muted-foreground">{store.manager}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{store.city}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(store)}>
                      <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  {store.address && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.address}</span>
                    </div>
                  )}
                  {store.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.phone}</span>
                    </div>
                  )}
                  {store.hours && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.hours}</span>
                    </div>
                  )}
                  {store.sqm ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-[10px]">📐 {store.sqm} m²</span>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editStore} onOpenChange={(open) => !open && setEditStore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">Redigera butik</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Butiksnamn</Label>
              <Input className="h-8 text-xs" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Stad</Label>
                <Input className="h-8 text-xs" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Yta (m²)</Label>
                <Input className="h-8 text-xs" type="number" value={form.sqm} onChange={e => setForm(f => ({ ...f, sqm: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Adress</Label>
              <Input className="h-8 text-xs" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input className="h-8 text-xs" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Ansvarig</Label>
                <Input className="h-8 text-xs" value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Öppettider</Label>
              <Input className="h-8 text-xs" placeholder="t.ex. Mån-Fre 08-17" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditStore(null)} className="text-xs">Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={updateStore.isPending} className="text-xs gap-1.5">
              <Save className="h-3 w-3" /> Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
