import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useDeleteMajorHoliday,
  useDeleteSpecialDay,
  useMajorHolidays,
  useSaveMajorHoliday,
  useSaveSpecialDay,
  useSaveStoreOrderSettings,
  useSpecialDays,
  useStoreOrderSettings,
} from "@/hooks/useStoreOrderSettings";
import { OpeningHours } from "@/lib/catering";

const DAYS: { key: string; label: string }[] = [
  { key: "1", label: "Måndag" },
  { key: "2", label: "Tisdag" },
  { key: "3", label: "Onsdag" },
  { key: "4", label: "Torsdag" },
  { key: "5", label: "Fredag" },
  { key: "6", label: "Lördag" },
  { key: "0", label: "Söndag" },
];

const emptyHours: OpeningHours = {};

/** Öppettider, kapacitetstak, avvikande dagar och storhelger för en butik. */
export function StoreOrderSettingsDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  storeName?: string | null;
  canEdit: boolean;
}) {
  const { data: settings } = useStoreOrderSettings(storeId);
  const save = useSaveStoreOrderSettings();
  const { data: specialDays = [] } = useSpecialDays(storeId);
  const saveSpecial = useSaveSpecialDay();
  const deleteSpecial = useDeleteSpecialDay();
  const { data: holidays = [] } = useMajorHolidays(storeId);
  const saveHoliday = useSaveMajorHoliday();
  const deleteHoliday = useDeleteMajorHoliday();

  const [hours, setHours] = useState<OpeningHours>(emptyHours);
  const [catering, setCatering] = useState("10");
  const [deliveries, setDeliveries] = useState("4");

  const [newSpecial, setNewSpecial] = useState({ day: "", closed: true, open_time: "", close_time: "", note: "" });
  const [newHoliday, setNewHoliday] = useState({
    name: "",
    holiday_date: "",
    last_order_date: "",
    capacity_cap: "",
    open_time: "",
    close_time: "",
  });

  useEffect(() => {
    if (settings) {
      setHours(settings.opening_hours || emptyHours);
      setCatering(String(settings.max_catering_per_day ?? 10));
      setDeliveries(String(settings.max_deliveries_per_slot ?? 4));
    }
  }, [settings]);

  const setDay = (key: string, patch: { open?: string; close?: string } | null) => {
    setHours((prev) => ({ ...prev, [key]: patch ? { open: patch.open ?? "10:00", close: patch.close ?? "18:00" } : null }));
  };

  const submit = async () => {
    try {
      await save.mutateAsync({
        store_id: storeId,
        opening_hours: hours,
        max_catering_per_day: Number(catering) || 0,
        max_deliveries_per_slot: Number(deliveries) || 0,
      } as any);
      toast.success("Inställningarna är sparade.");
    } catch (e: any) {
      toast.error(e.message || "Inställningarna kunde inte sparas.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Öppettider och kapacitet{storeName ? ` — ${storeName}` : ""}</DialogTitle>
          <DialogDescription>
            Styr vilka tider kunder kan hämta och hur många order butiken klarar per dag.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="hours">
          <TabsList className="flex-wrap">
            <TabsTrigger value="hours">Öppettider</TabsTrigger>
            <TabsTrigger value="special">Avvikande dagar</TabsTrigger>
            <TabsTrigger value="holidays">Storhelger</TabsTrigger>
          </TabsList>

          <TabsContent value="hours" className="space-y-3">
            {DAYS.map((d) => {
              const value = hours[d.key];
              return (
                <div key={d.key} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2">
                  <span className="w-24 font-medium">{d.label}</span>
                  <Switch
                    checked={!!value}
                    disabled={!canEdit}
                    onCheckedChange={(v) => setDay(d.key, v ? { open: "10:00", close: "18:00" } : null)}
                  />
                  {value ? (
                    <>
                      <Input
                        type="time"
                        className="h-11 w-[120px]"
                        disabled={!canEdit}
                        value={value.open?.slice(0, 5) ?? ""}
                        onChange={(e) => setDay(d.key, { open: e.target.value, close: value.close })}
                      />
                      <span>–</span>
                      <Input
                        type="time"
                        className="h-11 w-[120px]"
                        disabled={!canEdit}
                        value={value.close?.slice(0, 5) ?? ""}
                        onChange={(e) => setDay(d.key, { open: value.open, close: e.target.value })}
                      />
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Stängt</span>
                  )}
                </div>
              );
            })}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cateringorder per dag (tak)</Label>
                <Input
                  inputMode="numeric"
                  className="h-12"
                  disabled={!canEdit}
                  value={catering}
                  onChange={(e) => setCatering(e.target.value)}
                />
              </div>
              <div>
                <Label>Leveranser per tvåtimmarsintervall</Label>
                <Input
                  inputMode="numeric"
                  className="h-12"
                  disabled={!canEdit}
                  value={deliveries}
                  onChange={(e) => setDeliveries(e.target.value)}
                />
              </div>
            </div>
            {canEdit && (
              <Button className="h-12 w-full" onClick={submit} disabled={save.isPending}>
                Spara inställningar
              </Button>
            )}
          </TabsContent>

          <TabsContent value="special" className="space-y-3">
            {specialDays.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                <span className="font-mono tabular-nums">{s.day}</span>
                <span>
                  {s.closed
                    ? "Stängt"
                    : `${s.open_time?.slice(0, 5) ?? "?"}–${s.close_time?.slice(0, 5) ?? "?"}`}
                </span>
                {s.note && <span className="text-muted-foreground">{s.note}</span>}
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => deleteSpecial.mutate(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {specialDays.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Inga avvikande dagar framåt. Lägg upp röda dagar och kortare öppettider här.
              </p>
            )}
            {canEdit && (
              <Card>
                <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Datum</Label>
                    <Input
                      type="date"
                      className="h-11"
                      value={newSpecial.day}
                      onChange={(e) => setNewSpecial({ ...newSpecial, day: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch
                      checked={newSpecial.closed}
                      onCheckedChange={(v) => setNewSpecial({ ...newSpecial, closed: v })}
                    />
                    <span className="text-sm">Stängt hela dagen</span>
                  </div>
                  {!newSpecial.closed && (
                    <>
                      <div>
                        <Label className="text-xs">Öppnar</Label>
                        <Input
                          type="time"
                          className="h-11"
                          value={newSpecial.open_time}
                          onChange={(e) => setNewSpecial({ ...newSpecial, open_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Stänger</Label>
                        <Input
                          type="time"
                          className="h-11"
                          value={newSpecial.close_time}
                          onChange={(e) => setNewSpecial({ ...newSpecial, close_time: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Anteckning</Label>
                    <Input
                      className="h-11"
                      value={newSpecial.note}
                      onChange={(e) => setNewSpecial({ ...newSpecial, note: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 sm:col-span-2"
                    onClick={async () => {
                      if (!newSpecial.day) return toast.error("Välj ett datum.");
                      await saveSpecial.mutateAsync({
                        store_id: storeId,
                        day: newSpecial.day,
                        closed: newSpecial.closed,
                        open_time: newSpecial.closed ? null : newSpecial.open_time || null,
                        close_time: newSpecial.closed ? null : newSpecial.close_time || null,
                        note: newSpecial.note || null,
                      } as any);
                      setNewSpecial({ day: "", closed: true, open_time: "", close_time: "", note: "" });
                      toast.success("Dagen är sparad.");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Lägg till avvikande dag
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="holidays" className="space-y-3">
            {holidays.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                <span className="font-semibold">{h.name}</span>
                <span className="font-mono tabular-nums">{h.holiday_date}</span>
                <span className="text-muted-foreground">
                  Beställ senast {h.last_order_date}
                  {h.capacity_cap ? ` · tak ${h.capacity_cap} order` : ""}
                </span>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => deleteHoliday.mutate(h.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {holidays.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Inga storhelger upplagda. Lägg upp t.ex. julafton och midsommar med sista beställningsdag.
              </p>
            )}
            {canEdit && (
              <Card>
                <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Namn</Label>
                    <Input
                      className="h-11"
                      placeholder="t.ex. Julafton"
                      value={newHoliday.name}
                      onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Datum</Label>
                    <Input
                      type="date"
                      className="h-11"
                      value={newHoliday.holiday_date}
                      onChange={(e) => setNewHoliday({ ...newHoliday, holiday_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sista beställningsdag</Label>
                    <Input
                      type="date"
                      className="h-11"
                      value={newHoliday.last_order_date}
                      onChange={(e) => setNewHoliday({ ...newHoliday, last_order_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Kapacitetstak (order)</Label>
                    <Input
                      inputMode="numeric"
                      className="h-11"
                      value={newHoliday.capacity_cap}
                      onChange={(e) => setNewHoliday({ ...newHoliday, capacity_cap: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Öppnar</Label>
                      <Input
                        type="time"
                        className="h-11"
                        value={newHoliday.open_time}
                        onChange={(e) => setNewHoliday({ ...newHoliday, open_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stänger</Label>
                      <Input
                        type="time"
                        className="h-11"
                        value={newHoliday.close_time}
                        onChange={(e) => setNewHoliday({ ...newHoliday, close_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 sm:col-span-2"
                    onClick={async () => {
                      if (!newHoliday.name.trim() || !newHoliday.holiday_date || !newHoliday.last_order_date)
                        return toast.error("Namn, datum och sista beställningsdag behövs.");
                      await saveHoliday.mutateAsync({
                        name: newHoliday.name.trim(),
                        holiday_date: newHoliday.holiday_date,
                        last_order_date: newHoliday.last_order_date,
                        capacity_cap: newHoliday.capacity_cap ? Number(newHoliday.capacity_cap) : null,
                        open_time: newHoliday.open_time || null,
                        close_time: newHoliday.close_time || null,
                        store_id: storeId,
                      } as any);
                      setNewHoliday({
                        name: "",
                        holiday_date: "",
                        last_order_date: "",
                        capacity_cap: "",
                        open_time: "",
                        close_time: "",
                      });
                      toast.success("Storhelgen är sparad.");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Lägg till storhelg
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
