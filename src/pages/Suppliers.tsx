import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Edit, Trash2, Truck, Mail, Phone, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, Supplier } from "@/hooks/useSuppliers";
import { useNotificationFlash } from "@/lib/notificationFlash";
import { Switch } from "@/components/ui/switch";
import { CURRENCY_OPTIONS } from "@/lib/currency";


const SUPPLIER_TYPES = ["Färsk fisk", "Skaldjur", "Rökt fisk", "Emballage", "Kryddor & Tillbehör", "Transport", "Övrigt"];

export default function Suppliers() {
  const { flashClass } = useNotificationFlash("supplier");
  const { toast } = useToast();
  const { data: suppliers = [], isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    name: "", contact_person: "", email: "", phone: "", country: "Sverige", address: "", supplier_type: "Övrigt",
    currency: "SEK", is_intercompany: false,
  });

  const setField = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_person || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || s.supplier_type === filterType;
    return matchSearch && matchType;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", contact_person: "", email: "", phone: "", country: "Sverige", address: "", supplier_type: "Övrigt", currency: "SEK", is_intercompany: false });
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({
      name: s.name, contact_person: s.contact_person || "", email: s.email || "",
      phone: s.phone || "", country: s.country || "Sverige", address: s.address || "",
      supplier_type: s.supplier_type || "Övrigt",
      currency: (s.currency || "SEK").toUpperCase(),
      is_intercompany: !!s.is_intercompany,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) return;
    const payload = {
      name: form.name, contact_person: form.contact_person || null, email: form.email || null,
      phone: form.phone || null, country: form.country || null, address: form.address || null,
      supplier_type: form.supplier_type || "Övrigt",
      currency: form.currency || "SEK",
      is_intercompany: form.is_intercompany,
    };

    if (editId) {
      updateSupplier.mutate({ id: editId, ...payload }, {
        onSuccess: () => { toast({ title: "Leverantör uppdaterad", description: form.name }); setDialogOpen(false); },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    } else {
      createSupplier.mutate(payload, {
        onSuccess: () => { toast({ title: "Leverantör tillagd", description: form.name }); setDialogOpen(false); },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    }
  };


  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteSupplier.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: "Leverantör borttagen", description: deleteTarget.name }); setDeleteTarget(null); },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  const typeColor: Record<string, string> = {
    "Färsk fisk": "bg-primary/10 text-primary border-primary/20",
    "Skaldjur": "bg-accent/10 text-accent border-accent/20",
    "Rökt fisk": "bg-warning/15 text-warning border-warning/20",
    "Emballage": "bg-muted text-muted-foreground border-muted",
    "Transport": "bg-secondary text-secondary-foreground border-secondary",
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Leverantörer
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Hantera leverantörer med kontaktuppgifter och typ.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Ny leverantör
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt leverantörer</p>
          <p className="text-xl font-heading font-bold text-foreground">{suppliers.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Länder</p>
          <p className="text-xl font-heading font-bold text-foreground">{new Set(suppliers.map(s => s.country).filter(Boolean)).size}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Typer</p>
          <p className="text-xl font-heading font-bold text-foreground">{new Set(suppliers.map(s => s.supplier_type).filter(Boolean)).size}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Med e-post</p>
          <p className="text-xl font-heading font-bold text-foreground">{suppliers.filter(s => s.email).length}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Sök leverantör..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Alla typer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alla typer</SelectItem>
            {SUPPLIER_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <ResponsiveTable
            rows={filtered}
            rowKey={(s) => s.id}
            empty={suppliers.length === 0 ? 'Inga leverantörer ännu. Tryck "Ny leverantör" för att börja.' : "Inga leverantörer matchar sökningen."}
            columns={[
              { key: "name", header: "Leverantör", primary: true, cell: (s) => <span className="font-medium text-foreground">{s.name}</span> },
              {
                key: "type",
                header: "Typ",
                cell: (s) => (
                  <Badge variant="outline" className={`text-[11px] ${typeColor[s.supplier_type || ""] || ""}`}>
                    {s.supplier_type || "Övrigt"}
                  </Badge>
                ),
              },
              {
                key: "currency",
                header: "Valuta",
                cell: (s) => (
                  <>
                    <span className="font-mono tabular-nums text-foreground">{(s.currency || "SEK").toUpperCase()}</span>
                    {s.is_intercompany && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] border-primary/30 text-primary">Koncernintern</Badge>
                    )}
                  </>
                ),
              },
              { key: "contact", header: "Kontakt", cell: (s) => s.contact_person || "–" },
              { key: "email", header: "E-post", cell: (s) => s.email || "–" },
              { key: "phone", header: "Telefon", cell: (s) => s.phone || "–" },
              { key: "country", header: "Land", cell: (s) => s.country || "–" },
              { key: "address", header: "Adress", cell: (s) => s.address || "–" },
              {
                key: "actions",
                header: "Åtgärd",
                headerClassName: "text-center",
                className: "text-center",
                cell: (s) => (
                  <div className="flex items-center gap-2 sm:justify-center">
                    <Button variant="outline" size="sm" className="h-11 flex-1 gap-1.5 sm:h-7 sm:w-7 sm:flex-none sm:p-0" onClick={() => openEdit(s)}>
                      <Edit className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="sm:hidden">Ändra</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 flex-1 gap-1.5 text-destructive hover:text-destructive sm:h-7 sm:w-7 sm:flex-none sm:p-0"
                      onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="sm:hidden">Ta bort</span>
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera leverantör" : "Ny leverantör"}</DialogTitle>
            <DialogDescription className="text-xs">Fyll i leverantörsinformation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Företagsnamn *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Typ</Label>
                <Select value={form.supplier_type} onValueChange={v => setField("supplier_type", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPLIER_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kontaktperson</Label>
                <Input value={form.contact_person} onChange={e => setField("contact_person", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">E-post</Label>
                <Input value={form.email} onChange={e => setField("email", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefon</Label>
                <Input value={form.phone} onChange={e => setField("phone", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Land</Label>
                <Input value={form.country} onChange={e => setField("country", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Adress</Label>
                <Input value={form.address} onChange={e => setField("address", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fakturavaluta</Label>
                <Select value={form.currency} onValueChange={v => setField("currency", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Inköp från leverantören visas i den här valutan. Bokförs i bolagets valuta med kursen vid inköpstillfället.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Koncernintern</Label>
                <div className="flex items-center gap-2 h-8">
                  <Switch
                    checked={form.is_intercompany}
                    onCheckedChange={v => setField("is_intercompany", v)}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {form.is_intercompany ? "Ja – egen grossist" : "Nej – extern leverantör"}
                  </span>
                </div>
              </div>
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
            <AlertDialogTitle>Ta bort leverantör?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Är du säker på att du vill ta bort <span className="font-semibold">{deleteTarget?.name}</span>?
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
