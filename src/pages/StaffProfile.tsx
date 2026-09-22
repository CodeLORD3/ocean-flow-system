import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User, Mail, Phone, MapPin, LogIn, LogOut, Clock, Store as StoreIcon, ShieldCheck,
  History as HistoryIcon, ChevronRight, ListChecks, AlertTriangle, CalendarDays,
  Activity as ActivityIcon, Settings, Camera, Image as ImageIcon, Plus,
} from "lucide-react";
import { useMyActivity } from "@/hooks/useMyActivity";
import { useMyWork, type MyWorkItem } from "@/hooks/useMyWork";
import { useMyDayProgress } from "@/hooks/useMyDayProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { prepareUpload, COMPRESS_AVATAR } from "@/lib/imageCompress";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { PORTAL_OPTIONS } from "@/components/staff/StaffAccessDialog";
import {
  useMyOpenShift, useShiftHistory, useClockIn, useClockOut, useDirectClockAccess, shiftClock, shiftDuration,
} from "@/hooks/useStaffShifts";
import { dagsavslutStatus, dagsavslutText } from "@/lib/dagsavslut";

type TabKey = "uppgifter" | "tid" | "aktivitet" | "profil";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "uppgifter", label: "Mina uppgifter", icon: ListChecks },
  { key: "tid", label: "Min tid", icon: Clock },
  { key: "aktivitet", label: "Aktivitet", icon: ActivityIcon },
  { key: "profil", label: "Mina uppgifter om mig", icon: Settings },
];

export default function StaffProfile() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { staff, loading, refresh } = useStaffAuth();
  const { data: stores = [] } = useStores(true);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const { data: openShift } = useMyOpenShift(staff?.id);
  const { data: mayClockDirectly = false } = useDirectClockAccess(staff?.id);
  const { data: history = [] } = useShiftHistory(staff?.id);
  const { data: progress } = useMyDayProgress(staff?.id);

  const [tab, setTab] = useState<TabKey>("uppgifter");

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
  const role = (staff as any).role || (staff as any).title || null;

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
      className="mx-auto w-full max-w-[1400px] space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Vänster: rubrikkort med bild, namn och flikar + innehåll */}
        <div className="space-y-3">
          <Card className="overflow-hidden shadow-card">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
                  <div className="h-full w-full overflow-hidden rounded-full border-4 border-background bg-primary/10 shadow-md">
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
                        <User className="h-10 w-10 text-primary" />
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background",
                      openShift ? "bg-emerald-500" : "bg-muted-foreground/50",
                    )}
                    title={openShift ? "Instämplad" : "Ej instämplad"}
                  />
                  <label
                    className="absolute -bottom-1 left-0 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition hover:opacity-90"
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

                <div className="min-w-0 flex-1">
                  <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{fullName}</h1>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {[role, staff.workplace].filter(Boolean).join("  ·  ") || "Personal"}
                  </p>
                </div>

                {/* Stämpling direkt i rubriken */}
                <div className="w-full shrink-0 rounded-xl border border-border bg-muted/40 p-3 sm:w-64">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stämpelklocka</p>
                  {openShift ? (
                    <>
                      <p className="font-heading text-lg font-bold tabular-nums text-foreground">
                        {shiftClock(openShift.clocked_in_at)}
                      </p>
                      <p className="text-[11px] font-medium text-emerald-600">
                        {shiftDuration(openShift.clocked_in_at)}
                        {openStoreName ? ` · ${openStoreName}` : ""}
                      </p>
                      {mayClockDirectly && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full gap-1.5 text-xs"
                          disabled={clockOut.isPending}
                          onClick={handleClockOut}
                        >
                          <LogOut className="h-3.5 w-3.5" /> Stämpla ut
                        </Button>
                      )}
                    </>
                  ) : mayClockDirectly ? (
                    <div className="mt-1 space-y-2">
                      <Select value={effectiveStore} onValueChange={setSelectedStore}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj arbetsplats..." /></SelectTrigger>
                        <SelectContent>
                          {allowedStores.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        disabled={clockIn.isPending || !effectiveStore}
                        onClick={handleClockIn}
                      >
                        <LogIn className="h-3.5 w-3.5" /> Stämpla in
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ej instämplad. Stämpling sker i stämpelklockan.
                    </p>
                  )}
                </div>
              </div>

              {/* Flikar */}
              <div className="flex gap-1 overflow-x-auto border-t border-border px-3">
                {TABS.map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition",
                        active
                          ? "border-primary font-semibold text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <t.icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {tab === "uppgifter" && <MyWorkCard staffId={staff.id} stores={stores} />}
          {tab === "tid" && <ShiftHistoryCard history={history} stores={stores} />}
          {tab === "aktivitet" && (
            <MyActivityCard staffId={staff.id} userId={(staff as any).user_id ?? null} fullName={fullName} />
          )}
          {tab === "profil" && (
            <ProfileFactsCard
              staff={staff}
              storeCount={stores.length}
              allowedCount={allowedStores.length}
              isAdmin={isAdmin}
              portalAccess={portalAccess}
            />
          )}
        </div>

        {/* Höger: dagens framsteg, senaste aktivitet, snabbåtgärder */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm">Dagens framsteg</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <ProgressRing percent={progress?.percent ?? 0} />
              <div className="min-w-0 space-y-1.5 text-xs">
                <p className="text-sm font-semibold text-foreground">
                  {progress ? `${progress.done} av ${progress.total} uppgifter klara` : "Inga uppgifter idag"}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Klart
                  <span className="ml-auto font-mono tabular-nums text-foreground">{progress?.done ?? 0}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Kvar
                  <span className="ml-auto font-mono tabular-nums text-foreground">{progress?.left ?? 0}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <RecentActivityCard
            staffId={staff.id}
            userId={(staff as any).user_id ?? null}
            fullName={fullName}
            onShowAll={() => setTab("aktivitet")}
          />

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm">Snabbåtgärder</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              {[
                { label: "Lägg upp bild", icon: ImageIcon, route: "/image-feed" },
                { label: "Ny uppgift", icon: Plus, route: "/uppgifter" },
                { label: "Butikskarta", icon: MapPin, route: "/butikskarta" },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => navigate(withReturn(a.route))}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 text-center transition hover:bg-muted/50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10">
                    <a.icon className="h-4 w-4 text-primary" />
                  </span>
                  <span className="text-[11px] font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Lägger på en tydlig väg tillbaka till min sida. Sidan man landar på visar då
 * raden "Tillbaka till min sida" högst upp, precis som när man går tillbaka
 * från en enskild kundbeställning till listan.
 */
function withReturn(route: string) {
  const sep = route.includes("?") ? "&" : "?";
  return `${route}${sep}retur=${encodeURIComponent("/profile")}&returtext=${encodeURIComponent("min sida")}`;
}

/** Ring som visar hur stor del av dagens uppgifter som är klara. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, percent / 100)))}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-sm font-bold tabular-nums text-foreground">
        {percent}%
      </span>
    </div>
  );
}

/** Mina uppgifter om mig: kontaktuppgifter och behörigheter. */
function ProfileFactsCard({
  staff,
  storeCount,
  allowedCount,
  isAdmin,
  portalAccess,
}: {
  staff: any;
  storeCount: number;
  allowedCount: number;
  isAdmin: boolean;
  portalAccess: string[];
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { icon: Mail, label: "E-post", value: staff.email || "—" },
            { icon: Phone, label: "Telefon", value: staff.phone || "—" },
            { icon: MapPin, label: "Arbetsplats", value: staff.workplace || "—" },
            {
              icon: StoreIcon,
              label: "Behörig i",
              value: isAdmin
                ? "Alla arbetsplatser"
                : allowedCount === storeCount
                  ? "Alla butiker"
                  : `${allowedCount} arbetsplatser`,
            },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3.5 py-3">
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
  );
}

/** Mina stämplingar de senaste dagarna. */
function ShiftHistoryCard({
  history,
  stores,
}: {
  history: any[];
  stores: { id: string; name: string }[];
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-heading text-sm">
          <Clock className="h-4 w-4 text-primary" /> Senaste stämplingar
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Inga stämplingar registrerade ännu.</p>
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
                    <p className="font-medium text-foreground">
                      {new Date(sh.clocked_in_at).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{storeName ?? "—"}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-foreground">
                      {shiftClock(sh.clocked_in_at)} – {out ? shiftClock(out) : "pågår"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {mins === null ? shiftDuration(sh.clocked_in_at) : `${Math.floor(mins / 60)} h ${mins % 60} min`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Mina tilldelade uppgifter: försenade, idag och kommande — läses live från uppgifterna. */
function MyWorkCard({ staffId, stores }: { staffId: string; stores: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useMyWork(staffId);

  const groups: { key: string; label: string; icon: any; tone: string; rows: MyWorkItem[] }[] = useMemo(
    () => [
      { key: "late", label: "Försenat", icon: AlertTriangle, tone: "text-destructive", rows: items.filter((i) => i.late) },
      { key: "today", label: "Idag", icon: ListChecks, tone: "text-primary", rows: items.filter((i) => i.today) },
      {
        key: "next",
        label: "Kommande",
        icon: CalendarDays,
        tone: "text-muted-foreground",
        rows: items.filter((i) => !i.late && !i.today),
      },
    ],
    [items],
  );

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-4 p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Inga uppgifter är tilldelade dig just nu. Så fort någon delar ut en uppgift till dig hamnar den här.
          </p>
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div key={g.key} className="space-y-1.5">
                <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${g.tone}`}>
                  <g.icon className="h-3.5 w-3.5" /> {g.label}
                  <span className="tabular-nums text-muted-foreground">({g.rows.length})</span>
                </p>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {g.rows.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => navigate(withReturn(`/uppgifter?markera=${it.id}`))}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{it.task}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(it.date).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                          {it.time ? ` · ${it.time}` : ""}
                          {stores.find((s) => s.id === it.storeId)?.name
                            ? ` · ${stores.find((s) => s.id === it.storeId)!.name}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {it.minutes ? (
                          <span className="text-[10px] tabular-nums text-muted-foreground">{it.minutes} min</span>
                        ) : null}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
        )}
      </CardContent>
    </Card>
  );
}

/** Korta senaste händelser i högerspalten. */
function RecentActivityCard({
  staffId,
  userId,
  fullName,
  onShowAll,
}: {
  staffId: string;
  userId: string | null;
  fullName: string;
  onShowAll: () => void;
}) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useMyActivity(staffId, userId, fullName);
  const shown = items.slice(0, 5);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="font-heading text-sm">Senaste aktivitet</CardTitle>
        <button type="button" onClick={onShowAll} className="text-xs font-medium text-primary hover:underline">
          Visa alla
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </>
        ) : shown.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">Inget registrerat på dig ännu.</p>
        ) : (
          shown.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => it.route && navigate(withReturn(it.route))}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left",
                it.route && "transition hover:bg-muted/50",
              )}
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10">
                <ActivityIcon className="h-3 w-3 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{it.text}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {new Date(it.at).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
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
        <CardTitle className="flex items-center gap-2 font-heading text-sm">
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
          <p className="py-4 text-center text-xs text-muted-foreground">Inget registrerat på dig ännu.</p>
        ) : (
          <div className="divide-y divide-border">
            {shown.map((it) => (
              <div
                key={it.id}
                className={`flex items-start justify-between gap-3 py-2 ${it.route ? "cursor-pointer hover:bg-muted/40" : ""}`}
                onClick={() => it.route && navigate(withReturn(it.route))}
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-medium text-foreground">{it.text}</p>
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
