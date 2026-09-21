import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User, Mail, Phone, MapPin, LogIn, LogOut, Clock, Store as StoreIcon, ShieldCheck, IdCard,
  History as HistoryIcon, ChevronRight,
} from "lucide-react";
import { useMyActivity } from "@/hooks/useMyActivity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { prepareUpload, COMPRESS_AVATAR } from "@/lib/imageCompress";
import { Camera } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { PORTAL_OPTIONS } from "@/components/staff/StaffAccessDialog";
import {
  useMyOpenShift, useShiftHistory, useClockIn, useClockOut, useDirectClockAccess, shiftClock, shiftDuration,
} from "@/hooks/useStaffShifts";
import { dagsavslutStatus, dagsavslutText } from "@/lib/dagsavslut";

export default function StaffProfile() {
  const { toast } = useToast();
  const { staff, loading, refresh } = useStaffAuth();
  const { data: stores = [] } = useStores(true);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const { data: openShift } = useMyOpenShift(staff?.id);
  const { data: mayClockDirectly = false } = useDirectClockAccess(staff?.id);
  const { data: history = [] } = useShiftHistory(staff?.id);

  const portalAccess = (staff?.portal_access ?? []) as string[];
  const isAdmin = portalAccess.includes("admin");

  /** Arbetsplatser användaren har behörighet att stämpla in på. */
  const allowedStores = useMemo(() => {
    if (!staff) return [];
    const ids = new Set<string>([
      ...((staff.allowed_store_ids ?? []) as string[]),
      ...(staff.allowed_store_id ? [staff.allowed_store_id] : []),
    ]);
    if (isAdmin || ids.size === 0) return stores;
    return stores.filter((s) => ids.has(s.id));
  }, [staff, stores, isAdmin]);

  const [selectedStore, setSelectedStore] = useState<string>("");

  /**
   * Förvalet måste vara personens egen arbetsplats — annars hamnade stämplingen
   * på första enheten i listan (Administration) och personen syntes inte i butiken.
   * Ordning: senast valda på enheten → egen arbetsplats → första tillåtna.
   */
  const lastKey = staff ? `clock-last-store-${staff.id}` : "";
  const defaultStore = useMemo(() => {
    const ok = (id?: string | null) => !!id && allowedStores.some((s) => s.id === id);
    let remembered: string | null = null;
    try {
      remembered = lastKey ? localStorage.getItem(lastKey) : null;
    } catch {
      remembered = null;
    }
    if (ok(remembered)) return remembered as string;
    if (ok(staff?.store_id)) return staff!.store_id as string;
    const byName = allowedStores.find((s) => s.name === staff?.workplace)?.id;
    if (ok(byName)) return byName as string;
    return allowedStores[0]?.id ?? "";
  }, [allowedStores, staff, lastKey]);

  const effectiveStore = selectedStore || defaultStore;

  /** Personalen byter sin egen profilbild direkt här — bilden komprimeras före uppladdning. */
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !staff) return;
    setUploadingPhoto(true);
    try {
      const prepared = await prepareUpload(file, COMPRESS_AVATAR);
      const path = `profiles/${staff.id}-${Date.now()}.${prepared.ext}`;
      const up = await supabase.storage
        .from("staff-photos")
        .upload(path, prepared.file, { upsert: true, contentType: prepared.contentType });
      if (up.error) throw up.error;
      const { data: urlData } = supabase.storage.from("staff-photos").getPublicUrl(path);
      const { error } = await supabase
        .from("staff")
        .update({ profile_image_url: urlData.publicUrl } as any)
        .eq("id", staff.id);
      if (error) throw error;
      await refresh();
      toast({ title: "Profilbilden är uppdaterad" });
    } catch {
      toast({ title: "Kunde inte spara bilden", description: "Försök igen", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };


  if (loading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  }

  if (!staff) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Ingen personalprofil är kopplad till ditt konto. Kontakta administratören.
        </CardContent>
      </Card>
    );
  }

  const fullName = `${staff.first_name} ${staff.last_name}`;
  const openStoreName = stores.find((s) => s.id === openShift?.store_id)?.name;

  const handleClockIn = () => {
    if (!effectiveStore) {
      toast({ title: "Välj arbetsplats", description: "Du måste välja en arbetsplats innan du stämplar in.", variant: "destructive" });
      return;
    }
    clockIn.mutate(
      { staffId: staff.id, storeId: effectiveStore },
      {
        onSuccess: (res) => {
          const target = stores.find((s) => s.id === effectiveStore)?.name ?? "";
          try {
            localStorage.setItem(`clock-last-store-${staff.id}`, effectiveStore);
          } catch {
            /* ignore */
          }
          if (res.outcome === "already") {
            toast({ title: "Redan instämplad", description: `Du är redan instämplad i ${target}.` });
          } else if (res.outcome === "moved") {
            const from = stores.find((s) => s.id === res.previousStoreId)?.name;
            toast({
              title: "Stämpling flyttad",
              description: `Du stämplades ut från ${from ?? "tidigare arbetsplats"} och in i ${target}.`,
            });
          } else {
            toast({ title: "Instämplad", description: `${fullName} · ${target}` });
          }
        },
        onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleClockOut = () => {
    const shiftStore = openShift?.store_id ?? effectiveStore;
    clockOut.mutate(
      { staffId: staff.id },
      {
        onSuccess: async () => {
          toast({ title: "Utstämplad", description: openShift ? shiftDuration(openShift.clocked_in_at) : undefined });
          // Påminn om dagens avslut för butiken innan personalen går hem.
          const saknas = dagsavslutText(await dagsavslutStatus(shiftStore));
          if (saknas) {
            toast({
              title: "Kom ihåg innan du går",
              description: `${saknas} ${stores.find((s) => s.id === shiftStore)?.name ?? ""}`.trim(),
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-5xl space-y-8"
    >
      <div className="text-center sm:text-left">
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center justify-center gap-2 sm:justify-start">
          <IdCard className="h-5 w-5 text-primary" /> Min sida
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Allt som är mitt: mina uppgifter, min tid och allt jag gjort</p>
      </div>

      <Section title="Min profil" icon={User} note="Dina uppgifter och behörigheter">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Profil */}
        <Card className="shadow-card overflow-hidden lg:col-span-2">
          <div className="h-20 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
          <CardContent className="-mt-12 space-y-6 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative h-24 w-24">
                <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-background bg-primary/10 shadow-md">
                  {staff.profile_image_url ? (
                    <img
                      src={staff.profile_image_url}
                      alt={fullName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <User className="h-9 w-9 text-primary" />
                    </div>
                  )}
                </div>
                <label
                  className="absolute bottom-0 right-0 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition hover:opacity-90"
                  title="Byt profilbild"
                >
                  <Camera className="h-4 w-4" />
                  <span className="sr-only">Byt profilbild</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={handlePhotoPick}
                  />
                </label>
              </div>
              <div>
                <h3 className="font-heading text-xl font-semibold text-foreground">{fullName}</h3>
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${openShift ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
                  {openShift
                    ? `Instämplad ${shiftClock(openShift.clocked_in_at)} · ${shiftDuration(openShift.clocked_in_at)}${openStoreName ? ` · ${openStoreName}` : ""}`
                    : "Ej instämplad"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { icon: Mail, label: "E-post", value: staff.email || "—" },
                { icon: Phone, label: "Telefon", value: (staff as any).phone || "—" },
                { icon: MapPin, label: "Arbetsplats", value: staff.workplace || "—" },
                {
                  icon: StoreIcon,
                  label: "Behörig i",
                  value: isAdmin
                    ? "Alla arbetsplatser"
                    : allowedStores.length === stores.length
                      ? "Alla butiker"
                      : `${allowedStores.length} arbetsplatser`,
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
                    <p className="truncate text-xs font-medium text-foreground">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Behörigheter
              </p>
              <div className="flex flex-wrap gap-1.5">
                {portalAccess.length === 0 ? (
                  <Badge variant="outline" className="text-[10px]">Ingen portalåtkomst</Badge>
                ) : (
                  portalAccess.map((p) => (
                    <Badge key={p} variant="secondary" className="rounded-full px-2.5 text-[10px]">
                      {PORTAL_OPTIONS.find((o) => o.key === p)?.label ?? p}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Stämpelklocka */}
        <Card className="shadow-card flex h-full flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Stämpelklocka
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {!mayClockDirectly ? (
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Stämpling sker i stämpelklockan</p>
                <p className="mt-1 text-xs text-muted-foreground">Svensk personal kan inte stämpla in eller ut direkt i Makrilltrade.</p>
              </div>
            ) : openShift ? (
              <>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-[11px] text-muted-foreground">Instämplad sedan</p>
                  <p className="text-lg font-heading font-bold tabular-nums text-foreground">
                    {shiftClock(openShift.clocked_in_at)}
                  </p>
                  <p className="text-[11px] text-emerald-600 font-medium">
                    {shiftDuration(openShift.clocked_in_at)}
                    {openStoreName ? ` · ${openStoreName}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  disabled={clockOut.isPending}
                  onClick={handleClockOut}
                >
                  <LogOut className="h-3.5 w-3.5" /> Stämpla ut
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Arbetsplats</Label>
                  <Select value={effectiveStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj arbetsplats..." /></SelectTrigger>
                    <SelectContent>
                      {allowedStores.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {allowedStores.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Du har ingen arbetsplats kopplad till ditt konto.</p>
                  )}
                </div>
                <Button
                  className="w-full gap-1.5 text-xs"
                  disabled={clockIn.isPending || !effectiveStore}
                  onClick={handleClockIn}
                >
                  <LogIn className="h-3.5 w-3.5" /> Stämpla in
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      </Section>

      <Section title="Det här ska jag göra" icon={ListChecks} note="Uppgifter som är tilldelade mig">
        <MyWorkCard staffId={staff.id} stores={stores} />
      </Section>

      <Section title="Min tid" icon={Clock} note="Stämplingar de senaste dagarna">

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Senaste stämplingar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Inga stämplingar registrerade ännu.</p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((sh) => {
                const storeName = stores.find((s) => s.id === sh.store_id)?.name;
                const out = sh.clocked_out_at;
                const mins = out
                  ? Math.max(0, Math.round((new Date(out).getTime() - new Date(sh.clocked_in_at).getTime()) / 60000))
                  : null;
                return (
                  <div key={sh.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <p className="text-foreground font-medium">
                        {new Date(sh.clocked_in_at).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{storeName ?? "—"}</p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-foreground">
                        {shiftClock(sh.clocked_in_at)} – {out ? shiftClock(out) : "pågår"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {mins === null
                          ? shiftDuration(sh.clocked_in_at)
                          : `${Math.floor(mins / 60)} h ${mins % 60} min`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Allt jag gjort i systemet */}
      <MyActivityCard staffId={staff.id} userId={(staff as any).user_id ?? null} fullName={fullName} />
    </motion.div>
  );
}

/** Egen aktivitet: samlade spår från beställningar, uppgifter, lager, bilder och händelseloggen. */
function MyActivityCard({
  staffId,
  userId,
  fullName,
}: {
  staffId: string;
  userId: string | null;
  fullName: string;
}) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useMyActivity(staffId, userId, fullName);
  const [kind, setKind] = useState<string>("alla");

  const kinds = useMemo(() => Array.from(new Set(items.map((i) => i.kind))).sort(), [items]);
  const shown = useMemo(
    () => (kind === "alla" ? items : items.filter((i) => i.kind === kind)).slice(0, 150),
    [items, kind],
  );

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-primary" /> Det här har jag gjort
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {kinds.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {["alla", ...kinds].map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? "default" : "outline"}
                className="h-7 rounded-full px-3 text-[11px]"
                onClick={() => setKind(k)}
              >
                {k === "alla" ? "Allt" : k}
              </Button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Inget registrerat på dig ännu.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {shown.map((it) => (
              <div
                key={it.id}
                className={`flex items-start justify-between gap-3 py-2 ${it.route ? "cursor-pointer hover:bg-muted/40" : ""}`}
                onClick={() => it.route && navigate(it.route)}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground line-clamp-2">{it.text}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {it.kind}
                    {it.detail ? ` · ${it.detail}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-right">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {new Date(it.at).toLocaleString("sv-SE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {it.route && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
