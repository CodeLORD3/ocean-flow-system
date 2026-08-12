import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Users, Plus, Search, Edit, Trash2, Camera, User, Phone, Mail, MapPin, Save,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, StaffMember } from "@/hooks/useStaff";
import { useStores } from "@/hooks/useStores";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StaffDetailDialog } from "@/components/staff/StaffDetailDialog";
import { StaffAccessDialog, PORTAL_OPTIONS } from "@/components/staff/StaffAccessDialog";
import { StoreStaffDialog } from "@/components/staff/StoreStaffDialog";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import { useOpenShifts, shiftClock, shiftDuration } from "@/hooks/useStaffShifts";
import { edgeErrorMessage } from "@/lib/edgeError";

const ACTIVITY_VIEWER_EMAILS = [
  "joakim@fiskskaldjur.ch",
  "baldvin@fiskskaldjur.se",
  "timhvarfvenius@gmail.com",
];

export default function Staff() {
  const { toast } = useToast();
  const { site, activeStoreId } = useSite();
  const { staff: currentStaff } = useStaffAuth();
  // Endast konton med full admin får se och ändra andras behörigheter
  const isAdmin = ((currentStaff?.portal_access ?? []) as string[]).includes("admin");
  const canManageAccess = isAdmin;

  // Admin ser hela plattformen som standard, men kan filtrera till aktuell arbetsplats
  const [adminAllStaff, setAdminAllStaff] = useState(true);
  const platformView = isAdmin && adminAllStaff;

  const storeFilter = !platformView && site === "shop" ? activeStoreId : undefined;
  const { data: storeStaff = [], isLoading, refetch } = useStaff(storeFilter);
  const { data: allStaff = [] } = useStaff();
  const { data: stores = [] } = useStores(true);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const { data: openShifts = [] } = useOpenShifts(platformView ? undefined : storeFilter);
  const shiftByStaff = new Map(openShifts.map((s) => [s.staff_id, s]));


  const canViewActivity =
    isAdmin ||
    (site === "wholesale" &&
      !!currentStaff?.email &&
      ACTIVITY_VIEWER_EMAILS.includes(currentStaff.email.toLowerCase()));

  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [storeStaffOpen, setStoreStaffOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  // Inloggning: skapas separat från personalkortet
  const [creatingLoginFor, setCreatingLoginFor] = useState<string | null>(null);
  const [loginResult, setLoginResult] = useState<{ name: string; email: string; password: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detailStaff, setDetailStaff] = useState<any | null>(null);
  const [accessStaff, setAccessStaff] = useState<any | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);


  const emptyForm = {
    first_name: "", last_name: "", age: "", phone: "", email: "", workplace: "", store_id: "", profile_image_url: "", hourly_rate: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [originalEmail, setOriginalEmail] = useState("");
  const setField = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  // Instämplade på arbetsplatsen kan komma från andra hemmabutiker
  const staffList = (() => {
    const ids = new Set(storeStaff.map((s: any) => s.id));
    const extra = allStaff.filter((s: any) => !ids.has(s.id) && shiftByStaff.has(s.id));
    return [...storeStaff, ...extra];
  })();

  const visibleList = platformView || showAll ? staffList : staffList.filter((s: any) => shiftByStaff.has(s.id));


  const filtered = visibleList.filter(s => {
    const q = search.toLowerCase();
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.workplace || "").toLowerCase().includes(q);
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, store_id: site === "shop" && activeStoreId ? activeStoreId : "" });
    setPreviewUrl(null);
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setOriginalEmail((s.email || "").toLowerCase());
    setForm({
      first_name: s.first_name, last_name: s.last_name,
      age: s.age ? String(s.age) : "", phone: s.phone || "",
      email: s.email || "", workplace: s.workplace || "",
      store_id: s.store_id || "", profile_image_url: s.profile_image_url || "",
      hourly_rate: s.hourly_rate !== null && s.hourly_rate !== undefined ? String(s.hourly_rate) : "",
    });
    setPreviewUrl(s.profile_image_url || null);
    setDialogOpen(true);
  };

  // E-postfältet är också inloggningsadressen: ändras den måste själva kontot
  // bytas via en admin-funktion, annars kan personen inte logga in med den nya.
  const syncLoginEmail = async (staffId: string, email: string) => {
    const { data, error } = await supabase.functions.invoke("staff-account-email", {
      body: { staff_id: staffId, email },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Inloggningsadressen kunde inte ändras",
        description: await edgeErrorMessage(error, data),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Inloggningsadress uppdaterad",
      description: `${email} används nu vid inloggning.`,
    });
  };

  // Skapar ett riktigt inloggningskonto för en personal som saknar konto.
  // Personen får ett tillfälligt lösenord och måste byta det vid första inloggningen.
  const createLogin = async (s: any) => {
    const email = (s.email || "").trim().toLowerCase();
    if (!email) {
      toast({ title: "E-postadress saknas", description: "Lägg in en e-postadress på personalkortet först.", variant: "destructive" });
      return;
    }
    setCreatingLoginFor(s.id);
    // Tillfälligt lösenord: förnamnet med stor begynnelsebokstav + 123 (t.ex. "Leonie123")
    const rawFirst = String(s.first_name || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "");
    const baseName = rawFirst.length >= 2 ? rawFirst : "Makrill";
    const password = `${baseName.charAt(0).toUpperCase()}${baseName.slice(1).toLowerCase()}123`;
    const { data, error } = await supabase.functions.invoke("staff-account-email", {
      body: { staff_id: s.id, email, password },
    });
    if (error || (data as any)?.error) {
      setCreatingLoginFor(null);
      toast({
        title: "Kunde inte skapa inloggning",
        description: await edgeErrorMessage(error, data),
        variant: "destructive",
      });
      return;
    }
    await supabase.from("staff").update({ must_change_password: true } as any).eq("id", s.id);
    setCreatingLoginFor(null);
    setLoginResult({ name: `${s.first_name} ${s.last_name}`, email, password });
  };


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `profiles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("staff-photos").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Fel", description: "Kunde inte ladda upp bilden", variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("staff-photos").getPublicUrl(path);
    setForm(f => ({ ...f, profile_image_url: urlData.publicUrl }));
    setPreviewUrl(urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = () => {
    if (!form.first_name || !form.last_name) return;
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      age: form.age ? Number(form.age) : null,
      phone: form.phone || null,
      email: form.email || null,
      workplace: form.workplace || null,
      store_id: form.store_id || null,
      profile_image_url: form.profile_image_url || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
    };

    if (editId) {
      const newEmail = (form.email || "").trim().toLowerCase();
      const emailChanged = !!newEmail && newEmail !== originalEmail;
      updateStaff.mutate({ id: editId, ...payload }, {
        onSuccess: async () => {
          toast({ title: "Personal uppdaterad", description: `${form.first_name} ${form.last_name}` });
          setDialogOpen(false);
          if (emailChanged && isAdmin) await syncLoginEmail(editId, newEmail);
          setOriginalEmail(newEmail);
        },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    } else {
      createStaff.mutate(payload, {
        onSuccess: () => { toast({ title: "Personal tillagd", description: `${form.first_name} ${form.last_name}` }); setDialogOpen(false); },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteStaff.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: "Personal borttagen", description: deleteTarget.name }); setDeleteTarget(null); },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Personal
            {platformView && <Badge variant="secondary" className="text-[9px]">Admin · hela plattformen</Badge>}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {platformView
              ? "All personal i alla butiker och portaler — redigera uppgifter och behörigheter"
              : "Personal kopplad till butiken — stämpling sker på Min profil"}
          </p>

        </div>
        <div className="flex items-center gap-2">
          {site === "shop" && activeStoreId && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setStoreStaffOpen(true)}>
              <Users className="h-3.5 w-3.5" /> Personal i butiken
            </Button>
          )}
          <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Lägg till personal
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Totalt personal</p><p className="text-xl font-heading font-bold text-foreground">{staffList.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Instämplade nu</p><p className="text-xl font-heading font-bold text-foreground">{openShifts.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Arbetsplatser</p><p className="text-xl font-heading font-bold text-foreground">{new Set(staffList.map(s => s.workplace).filter(Boolean)).size}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Med e-post</p><p className="text-xl font-heading font-bold text-foreground">{staffList.filter(s => s.email).length}</p></CardContent></Card>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
      <div className="relative max-w-xs flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Sök personal..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
      </div>
      {isAdmin && (
        <Button variant={adminAllStaff ? "default" : "outline"} size="sm" className="text-xs gap-1.5" onClick={() => setAdminAllStaff(v => !v)}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {adminAllStaff ? "Visar all personal (plattform)" : "Visa all personal (plattform)"}
        </Button>
      )}
      {!platformView && (
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAll(v => !v)}>
          {showAll ? "Visa endast instämplade" : "Visa all personal i butiken"}
        </Button>
      )}

      </div>

      {/* Staff grid */}
      {filtered.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
          {staffList.length === 0
            ? 'Ingen personal tillagd ännu. Klicka "Lägg till personal" för att börja.'
            : !platformView && !showAll && visibleList.length === 0
              ? "Ingen personal är instämplad på den här arbetsplatsen just nu. Stämpling sker på sidan Min profil."
              : "Inga resultat matchar sökningen."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s: any) => (
            <Card
              key={s.id}
              className={`shadow-card hover:shadow-card-hover transition-shadow ${canViewActivity ? "cursor-pointer" : ""}`}
              onClick={canViewActivity ? () => setDetailStaff(s) : undefined}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {s.profile_image_url ? (
                        <img src={s.profile_image_url} alt={`${s.first_name} ${s.last_name}`} className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${shiftByStaff.has(s.id) ? "bg-emerald-500" : "bg-red-500"}`}
                          title={shiftByStaff.has(s.id) ? "Instämplad" : "Utstämplad"}
                        />
                        {s.first_name} {s.last_name}
                      </h3>
                      {shiftByStaff.has(s.id) ? (
                        <p className="text-[10px] text-emerald-600 font-medium">
                          Instämplad {shiftClock(shiftByStaff.get(s.id)!.clocked_in_at)} · {shiftDuration(shiftByStaff.get(s.id)!.clocked_in_at)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">Ej instämplad{s.age ? ` · ${s.age} år` : ""}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {canViewActivity && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Visa aktivitet"
                        onClick={(e) => { e.stopPropagation(); setDetailStaff(s); }}
                      >
                        <Activity className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                    {canManageAccess && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Behörigheter"
                        onClick={(e) => { e.stopPropagation(); setAccessStaff(s); }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                      <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: s.id, name: `${s.first_name} ${s.last_name}` }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {s.workplace && <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3 shrink-0 text-primary/60" /><span className="text-[10px]">{s.workplace}</span></div>}
                  {s.stores?.name && <div className="flex items-center gap-1.5 text-muted-foreground"><span className="text-[10px]">🏪 {s.stores.name}</span></div>}
                  {s.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3 shrink-0 text-primary/60" /><span className="text-[10px]">{s.phone}</span></div>}
                  {s.email && <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3 shrink-0 text-primary/60" /><span className="text-[10px]">{s.email}</span></div>}
                  {canManageAccess && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(s.portal_access ?? []).includes("admin") ? (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Full admin</Badge>
                      ) : (s.portal_access ?? []).length === 0 ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">Ingen portalåtkomst</Badge>
                      ) : (
                        (s.portal_access as string[]).map((p) => (
                          <Badge key={p} variant="secondary" className="text-[9px] px-1.5 py-0">
                            {PORTAL_OPTIONS.find((o) => o.key === p)?.label ?? p}
                          </Badge>
                        ))
                      )}
                      {(s.portal_access ?? []).includes("shop") && !(s.portal_access ?? []).includes("admin") && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          {((s.allowed_store_ids ?? []).length === 0 && !s.allowed_store_id)
                            ? "Alla butiker"
                            : `${new Set([...(s.allowed_store_ids ?? []), ...(s.allowed_store_id ? [s.allowed_store_id] : [])]).size} butiker`}
                        </Badge>
                      )}
                    </div>
                  )}
                  {isAdmin && !s.user_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full gap-1.5 text-xs"
                      disabled={creatingLoginFor === s.id}
                      onClick={(e) => { e.stopPropagation(); createLogin(s); }}
                    >
                      {creatingLoginFor === s.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <KeyRound className="h-3.5 w-3.5" />}
                      Skapa inloggning
                    </Button>
                  )}
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera personal" : "Lägg till personal"}</DialogTitle>
            <DialogDescription className="text-xs">Fyll i personaluppgifterna nedan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Profile image */}
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden cursor-pointer shrink-0 relative group"
                onClick={() => fileRef.current?.click()}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Profil" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-6 w-6 text-primary" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <Camera className="h-4 w-4 text-white" />
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Profilbild</p>
                <p>Klicka för att ladda upp{uploading ? " — laddar upp..." : ""}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Förnamn *</Label>
                <Input value={form.first_name} onChange={e => setField("first_name", e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Efternamn *</Label>
                <Input value={form.last_name} onChange={e => setField("last_name", e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ålder</Label>
                <Input type="number" value={form.age} onChange={e => setField("age", e.target.value)} className="h-8 text-xs" placeholder="t.ex. 28" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefonnummer</Label>
                <Input value={form.phone} onChange={e => setField("phone", e.target.value)} className="h-8 text-xs" placeholder="070-123 45 67" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-postadress (inloggning)</Label>
              <Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} className="h-8 text-xs" />
              {editId && isAdmin && (
                <p className="text-[10px] text-muted-foreground">
                  Ändras adressen byts även inloggningsadressen för kontot.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Arbetsplats</Label>
                <Input value={form.workplace} onChange={e => setField("workplace", e.target.value)} className="h-8 text-xs" placeholder="t.ex. Produktion" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Timlön (kr/h)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.hourly_rate}
                  onChange={e => setField("hourly_rate", e.target.value)}
                  className="h-8 text-xs"
                  placeholder="t.ex. 175"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Butik</Label>
                <Select value={form.store_id} onValueChange={v => setField("store_id", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj butik..." /></SelectTrigger>
                  <SelectContent>
                    {stores.map(st => (
                      <SelectItem key={st.id} value={st.id} className="text-xs">{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.first_name || !form.last_name || uploading}>
              <Save className="h-3 w-3 mr-1.5" /> Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort personal?</AlertDialogTitle>
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

      {/* Personal activity dialog */}
      <StaffDetailDialog
        open={!!detailStaff}
        onOpenChange={(open) => !open && setDetailStaff(null)}
        staff={detailStaff}
      />

      {/* Portal permissions dialog */}
      {site === "shop" && activeStoreId && (
        <StoreStaffDialog
          open={storeStaffOpen}
          onOpenChange={setStoreStaffOpen}
          storeId={activeStoreId}
          storeName={stores.find((st: any) => st.id === activeStoreId)?.name || "butiken"}
        />
      )}

      <StaffAccessDialog
        open={!!accessStaff}
        onOpenChange={(open) => !open && setAccessStaff(null)}
        staff={accessStaff}
      />

      {/* Tillfälligt lösenord visas en gång — kopiera och ge till personen */}
      <Dialog open={!!loginResult} onOpenChange={(open) => { if (!open) { setLoginResult(null); refetch(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Inloggning skapad</DialogTitle>
            <DialogDescription className="text-xs">
              {loginResult?.name} kan nu logga in. Lösenordet visas bara en gång och måste bytas vid första inloggningen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 font-mono">
              <div><span className="text-muted-foreground">E-post: </span>{loginResult?.email}</div>
              <div><span className="text-muted-foreground">Lösenord: </span>{loginResult?.password}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                navigator.clipboard?.writeText(`${loginResult?.email} / ${loginResult?.password}`);
                toast({ title: "Kopierat", description: "Inloggningsuppgifterna ligger i urklipp." });
              }}
            >
              Kopiera uppgifter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>

  );
}
