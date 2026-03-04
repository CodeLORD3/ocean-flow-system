import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Edit, Trash2, Users, Mail, Phone, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export default function Customers() {
  const { toast } = useToast();
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", contact_person: "", notes: "",
  });

  const setField = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", email: "", phone: "", address: "", city: "", contact_person: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      name: c.name, email: c.email || "", phone: c.phone || "",
      address: c.address || "", city: c.city || "",
      contact_person: c.contact_person || "", notes: c.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) return;
    const payload = {
      name: form.name, email: form.email || null, phone: form.phone || null,
      address: form.address || null, city: form.city || null,
      contact_person: form.contact_person || null, notes: form.notes || null,
      store_id: null,
    };

    if (editId) {
      updateCustomer.mutate({ id: editId, ...payload }, {
        onSuccess: () => { toast({ title: "Kund uppdaterad", description: form.name }); setDialogOpen(false); },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    } else {
      createCustomer.mutate(payload, {
        onSuccess: () => { toast({ title: "Kund tillagd", description: form.name }); setDialogOpen(false); },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCustomer.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: "Kund borttagen", description: deleteTarget.name }); setDeleteTarget(null); },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Kunder
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Hantera specialkunder kopplade till butiken.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Lägg till kund
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt kunder</p>
          <p className="text-xl font-heading font-bold text-foreground">{customers.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Med e-post</p>
          <p className="text-xl font-heading font-bold text-foreground">{customers.filter(c => c.email).length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Städer</p>
          <p className="text-xl font-heading font-bold text-foreground">{new Set(customers.map(c => c.city).filter(Boolean)).size}</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Sök kund..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
      </div>

      {/* Table */}
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
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {customers.length === 0 ? "Inga kunder ännu. Klicka \"Lägg till kund\" för att börja." : "Inga kunder matchar sökningen."}
                  </td></tr>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera kund" : "Lägg till kund"}</DialogTitle>
            <DialogDescription className="text-xs">Fyll i kunduppgifterna nedan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Företagsnamn / Namn *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kontaktperson</Label>
                <Input value={form.contact_person} onChange={e => setField("contact_person", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-post</Label>
                <Input value={form.email} onChange={e => setField("email", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Telefon</Label>
                <Input value={form.phone} onChange={e => setField("phone", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stad</Label>
                <Input value={form.city} onChange={e => setField("city", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adress</Label>
              <Input value={form.address} onChange={e => setField("address", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Anteckningar</Label>
              <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} className="text-xs min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kund?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Är du säker på att du vill ta bort <span className="font-semibold">{deleteTarget?.name}</span>? Detta kan inte ångras.
            </AlertDialogDescription>
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
