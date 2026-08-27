/**
 * Stationsadmin och väntande registreringar för stämpelklockan.
 */
import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  IndustryFrame,
  IndustryButton,
  IndustryRow,
  SectionLabel,
  StatusLabel,
  DecisionBar,
  DecisionMetric,
  SideQueue,
  QueueItem,
} from "@/components/industry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus, RefreshCw, Ban } from "lucide-react";
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
    <IndustryFrame className="p-4 sm:p-6">
      {/* Beslutsrad: ett fokus — stationerna. Sidokön tar avvikelserna. */}
      <DecisionBar>
        <div className="mr-auto">
          <SectionLabel>Stämpelklocka</SectionLabel>
          <h1 className="ind-h1">Stationer</h1>
          <p className="ind-muted text-sm">
            En station = ett försäljningsställe. Aktiveringskoden visas bara en gång.
          </p>
        </div>
        <DecisionMetric label="Aktiva stationer" value={stations.filter((s) => s.status === "active").length} />
        <DecisionMetric
          label="Väntar granskning"
          value={pending.length}
          tone={pending.length > 0 ? "progress" : "neutral"}
        />
        <IndustryButton variant="primary" corners size="touch" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Ny station
        </IndustryButton>
      </DecisionBar>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <SectionLabel className="mb-3">Stationslista</SectionLabel>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin ind-muted" />
          ) : stations.length === 0 ? (
            <p className="ind-muted text-sm">Ingen station finns ännu. Skapa en station för pilotbutiken.</p>
          ) : (
            stations.map((s) => (
              <IndustryRow key={s.id} edge={s.status === "active" ? "accent" : "neutral"} className="flex-wrap">
                <div className="min-w-[190px]">
                  <p className="ind-h3">{s.name}</p>
                  <p className="ind-muted text-sm">
                    {s.store_id ? storeName.get(s.store_id) ?? "–" : "Ingen enhet"}
                  </p>
                </div>
                <div className="ind-muted text-sm">
                  <SectionLabel>Senast sedd</SectionLabel>
                  <span className="ind-mono">{dateTime(s.last_seen_at)}</span>
                </div>
                <div className="ind-muted text-sm">
                  <SectionLabel>Kod</SectionLabel>
                  <span className="ind-mono">••{s.activation_code_hint ?? "––"}</span>
                </div>
                <StatusLabel tone={s.status === "active" ? "ok" : "alert"}>
                  {s.status === "active" ? "Aktiv" : "Revokerad"}
                </StatusLabel>
                <div className="ml-auto flex gap-1">
                  <IndustryButton variant="ghost" onClick={() => openProfile(s)}>
                    Profil
                  </IndustryButton>
                  <IndustryButton variant="ghost" onClick={() => doRotate(s)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Rotera kod
                  </IndustryButton>
                  <IndustryButton
                    variant="ghost"
                    disabled={s.status !== "active"}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    <Ban className="h-3.5 w-3.5" /> Återkalla
                  </IndustryButton>
                </div>
              </IndustryRow>
            ))
          )}
        </section>

        {/* Sidokö: avvikelser med EN åtgärd per post */}
        <SideQueue label="Väntande registreringar" empty="Inga väntande registreringar.">
          {pending.length === 0 ? (
            <p className="ind-muted text-sm">Inga väntande registreringar.</p>
          ) : (
            pending.map((p) => (
              <QueueItem key={p.id}>
                <p className="ind-mono text-sm">{p.pnr_masked ?? p.identifier_masked ?? "okänd"}</p>
                <p className="text-sm">{p.stated_name ?? "Namn saknas"}</p>
                <p className="ind-muted text-sm">
                  {p.store_id ? storeName.get(p.store_id) ?? "–" : "–"} · {dateTime(p.occurred_at)}
                </p>
                <IndustryButton variant="primary" className="mt-2 w-full" onClick={() => setApproveFor(p.id)}>
                  Granska
                </IndustryButton>
              </QueueItem>
            ))
          )}
        </SideQueue>
      </div>

      {/* Granska väntande registrering: godkänn / koppla / avvisa */}
      <Dialog open={Boolean(approveFor)} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent className="ind">
          <DialogHeader>
            <DialogTitle className="ind-h2">Granska registrering</DialogTitle>
            <DialogDescription className="ind-muted">
              Koppla stämplingen till en person, eller avvisa registreringen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <SectionLabel>Person</SectionLabel>
            <Select value={approveEmployee} onValueChange={setApproveEmployee}>
              <SelectTrigger>
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
          </div>
          <DialogFooter>
            <IndustryButton
              variant="ghost"
              onClick={async () => {
                if (!approveFor) return;
                await handlePending.mutateAsync({ id: approveFor, action: "rejected" });
                setApproveFor(null);
              }}
            >
              Avvisa
            </IndustryButton>
            <IndustryButton
              variant="primary"
              disabled={!approveEmployee}
              onClick={async () => {
                if (!approveFor) return;
                await handlePending.mutateAsync({
                  id: approveFor,
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
              Godkänn
            </IndustryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
          <div className="ind ind-accent-surface ind-corners space-y-4 p-4 text-center">
            <span className="ind-corner-b" aria-hidden="true" />
            <p className="ind-h1 ind-mono tracking-[0.2em]">{codeReveal?.code}</p>
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
    </IndustryFrame>
  );
}
