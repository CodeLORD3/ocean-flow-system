import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  User, Mail, Phone, MapPin, LogIn, LogOut, Clock, Store as StoreIcon, ShieldCheck, IdCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { PORTAL_OPTIONS } from "@/components/staff/StaffAccessDialog";
import {
  useMyOpenShift, useShiftHistory, useClockIn, useClockOut, shiftClock, shiftDuration,
} from "@/hooks/useStaffShifts";

export default function StaffProfile() {
  const { toast } = useToast();
  const { staff, loading } = useStaffAuth();
  const { data: stores = [] } = useStores(true);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const { data: openShift } = useMyOpenShift(staff?.id);
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
  const effectiveStore = selectedStore || allowedStores[0]?.id || "";

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
    clockOut.mutate(
      { staffId: staff.id },
      {
        onSuccess: () => toast({ title: "Utstämplad", description: openShift ? shiftDuration(openShift.clocked_in_at) : undefined }),
        onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <IdCard className="h-5 w-5 text-primary" /> Min profil
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Dina uppgifter, behörigheter och stämpelklocka</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profil */}
        <Card className="shadow-card lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                {staff.profile_image_url ? (
                  <img src={staff.profile_image_url} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-heading font-semibold text-foreground text-lg">{fullName}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span className={`h-2 w-2 rounded-full ${openShift ? "bg-emerald-500" : "bg-red-500"}`} />
                  {openShift
                    ? `Instämplad ${shiftClock(openShift.clocked_in_at)} · ${shiftDuration(openShift.clocked_in_at)}${openStoreName ? ` · ${openStoreName}` : ""}`
                    : "Ej instämplad"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                <span className="truncate">{staff.email || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                <span>{(staff as any).phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                <span>{staff.workplace || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <StoreIcon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                <span>
                  {isAdmin
                    ? "Alla arbetsplatser"
                    : allowedStores.length === stores.length
                      ? "Alla butiker"
                      : `${allowedStores.length} arbetsplats(er)`}
                </span>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
                <ShieldCheck className="h-3 w-3" /> Behörigheter
              </p>
              <div className="flex flex-wrap gap-1">
                {portalAccess.length === 0 ? (
                  <Badge variant="outline" className="text-[10px]">Ingen portalåtkomst</Badge>
                ) : (
                  portalAccess.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">
                      {PORTAL_OPTIONS.find((o) => o.key === p)?.label ?? p}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stämpelklocka */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Stämpelklocka
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openShift ? (
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

      {/* Historik */}
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
                  <div key={sh.id} className="flex items-center justify-between py-2 text-xs">
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
    </motion.div>
  );
}
