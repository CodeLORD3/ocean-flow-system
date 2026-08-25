/**
 * Stationsadmin och väntande registreringar för stämpelklockan.
 */
import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Ban, MonitorSmartphone, UserPlus } from "lucide-react";
import {
  useClockStations,
  useCreateClockStation,
  useRotateStationCode,
  useRevokeStation,
  useUpdateStationProfile,
  usePendingRegistrations,
  useHandlePendingRegistration,
  type ClockStation,
  type ClockStationProfile,
} from "@/hooks/useClock";
import { useStores } from "@/hooks/useStores";
import { useEmployees } from "@/hooks/useEmployees";

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "–";

export default function ClockStations() {
  const { data: stations = [], isLoading } = useClockStations();
  const { data: stores = [] } = useStores();
  const { data: employees = [] } = useEmployees(false);
  const { data: pending = [] } = usePendingRegistrations("pending");

  const createStation = useCreateClockStation();
  const rotate = useRotateStationCode();
  const revoke = useRevokeStation();
  const updateProfile = useUpdateStationProfile();
  const handlePending = useHandlePendingRegistration();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [codeReveal, setCodeReveal] = useState<{ code: string; qr: string; station: string } | null>(null);
  const [editing, setEditing] = useState<ClockStation | null>(null);
  const [profile, setProfile] = useState<ClockStationProfile>({});
  const [approveFor, setApproveFor] = useState<string | null>(null);
  const [approveEmployee, setApproveEmployee] = useState<string>("");

  const storeName = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  const revealCode = async (code: string, stationName: string) => {
    const qr = await QRCode.toDataURL(code, { width: 320, margin: 1 });
    setCodeReveal({ code, qr, station: stationName });
  };

  const doCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await createStation.mutateAsync({
        name: name.trim(),
        store_id: storeId || null,
      });
      setCreateOpen(false);
      setName("");
      setStoreId("");
      await revealCode(res.activation_code, name.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte skapa station");
    }
  };

  const doRotate = async (station: ClockStation) => {
    try {
      const res = await rotate.mutateAsync(station.id);
      await revealCode(res.activation_code, station.name);
      toast.success("Ny kod skapad. Den gamla koden gäller inte längre.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte rotera koden");
    }
  };

  const openProfile = (station: ClockStation) => {
    setEditing(station);
    setProfile(station.profile ?? {});
  };

  const saveProfile = async () => {
    if (!editing) return;
    try {
      await updateProfile.mutateAsync({ id: editing.id, profile });
      toast.success("Klockprofil sparad");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stämpelklocka</h1>
          <p className="text-sm text-muted-foreground">
            Stationer per försäljningsställe, aktiveringskoder och väntande registreringar.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Ny station
        </Button>
      </div>

      <Tabs defaultValue="stations">
        <TabsList>
          <TabsTrigger value="stations">Stationer ({stations.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Väntande registreringar {pending.length > 0 && <Badge className="ml-2">{pending.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stations" className="space-y-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : stations.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Ingen station finns ännu. Skapa en station för pilotbutiken.
            </Card>
          ) : (
            stations.map((s) => (
              <Card key={s.id} className="p-4 flex flex-wrap items-center gap-4">
                <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-[200px]">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.store_id ? storeName.get(s.store_id) ?? "–" : "Ingen enhet"} · {s.legal_entity_id ?? "–"}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Kod slutar på ••{s.activation_code_hint ?? "––"}</p>
                  <p>Roterad {dateTime(s.code_rotated_at)}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Senast sedd</p>
                  <p className="font-mono">{dateTime(s.last_seen_at)}</p>
                </div>
                <Badge variant={s.status === "active" ? "secondary" : "destructive"}>
                  {s.status === "active" ? "Aktiv" : "Återkallad"}
                </Badge>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openProfile(s)}>
                    Profil
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => doRotate(s)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Rotera kod
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive"
                    disabled={s.status !== "active"}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    <Ban className="h-3.5 w-3.5" /> Återkalla
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3">
          {pending.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Inga väntande registreringar.
            </Card>
          ) : (
            pending.map((p) => (
              <Card key={p.id} className="p-4 flex flex-wrap items-center gap-4">
                <UserPlus className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium font-mono">{p.pnr_masked ?? p.identifier_masked ?? "okänd"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.stated_name ?? "Namn saknas"} · {p.store_id ? storeName.get(p.store_id) ?? "–" : "–"} ·{" "}
                    {dateTime(p.occurred_at)} · {p.attempts} försök
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {approveFor === p.id ? (
                    <>
                      <Select value={approveEmployee} onValueChange={setApproveEmployee}>
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder="Koppla till person" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.first_name} {e.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!approveEmployee}
                        onClick={async () => {
                          await handlePending.mutateAsync({
                            id: p.id,
                            action: "approved",
                            employee_id: approveEmployee,
                          });
                          setApproveFor(null);
                          setApproveEmployee("");
                          toast.success(
                            "Godkänd. Personen kan stämpla när personnummret är kopplat på personalkortet.",
                          );
                        }}
                      >
                        Spara
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setApproveFor(null)}>
                        Avbryt
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setApproveFor(p.id)}>
                        Godkänn
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handlePending.mutate({ id: p.id, action: "rejected" })}
                      >
                        Avvisa
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Skapa station */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny klockstation</DialogTitle>
            <DialogDescription>En station = ett försäljningsställe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Namn</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Klocka kassa" />
            </div>
            <div className="space-y-1">
              <Label>Enhet</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj butik" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doCreate} disabled={createStation.isPending || !name.trim()}>
              {createStation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visa kod en gång */}
      <Dialog open={Boolean(codeReveal)} onOpenChange={() => setCodeReveal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aktiveringskod — {codeReveal?.station}</DialogTitle>
            <DialogDescription>
              Koden visas bara en gång. Ange den på klockan (/clock) eller skanna QR-koden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-3xl font-mono tracking-[0.2em]">{codeReveal?.code}</p>
            {codeReveal?.qr && <img src={codeReveal.qr} alt="QR med aktiveringskod" className="mx-auto rounded" />}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (codeReveal) navigator.clipboard.writeText(codeReveal.code);
                toast.success("Kopierad");
              }}
            >
              Kopiera
            </Button>
            <Button onClick={() => setCodeReveal(null)}>Klar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Klockprofil */}
      <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Klockprofil — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Avrundning</Label>
                <Select
                  value={profile.rounding?.mode ?? "none"}
                  onValueChange={(v) =>
                    setProfile((p) => ({ ...p, rounding: { ...p.rounding, mode: v } }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    <SelectItem value="step">Närmaste steg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Steg (min)</Label>
                <Select
                  value={String(profile.rounding?.step ?? 5)}
                  onValueChange={(v) =>
                    setProfile((p) => ({ ...p, rounding: { ...p.rounding, step: Number(v) } }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Riktning</Label>
                <Select
                  value={profile.rounding?.direction ?? "nearest"}
                  onValueChange={(v) =>
                    setProfile((p) => ({ ...p, rounding: { ...p.rounding, direction: v } }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearest">Närmaste</SelectItem>
                    <SelectItem value="up">Uppåt</SelectItem>
                    <SelectItem value="down">Nedåt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Rast</Label>
                <Select
                  value={profile.break?.mode ?? "manual"}
                  onValueChange={(v) => setProfile((p) => ({ ...p, break: { ...p.break, mode: v } }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manuell</SelectItem>
                    <SelectItem value="auto">Auto efter X h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Auto efter (h)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={profile.break?.auto_after_hours ?? 6}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      break: { ...p.break, auto_after_hours: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Rastlängd (min)</Label>
                <Input
                  type="number"
                  value={profile.break?.auto_minutes ?? 30}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      break: { ...p.break, auto_minutes: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="space-y-1">
                <Label>Tolerans mot schema (min)</Label>
                <Input
                  type="number"
                  value={profile.tolerance_minutes ?? 7}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, tolerance_minutes: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={Boolean(profile.geofence)}
                  onCheckedChange={(v) => setProfile((p) => ({ ...p, geofence: v }))}
                />
                <Label>Geofence</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveProfile} disabled={updateProfile.isPending}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
