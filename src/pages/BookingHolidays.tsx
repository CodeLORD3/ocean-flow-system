import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBookingStores,
  useStoreSpecialDays,
  useSaveSpecialDay,
  useDeleteSpecialDay,
} from "@/hooks/useBookingAdmin";

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Helgdagskalender: avvikande öppettider per butik och datum. Stängda dagar
 * slår igenom i bokningssidans steg 3 — ingen kan boka hämtning då.
 */
export default function BookingHolidays() {
  const { data: stores = [] } = useBookingStores();
  const { data: days = [], isLoading } = useStoreSpecialDays();
  const save = useSaveSpecialDay();
  const remove = useDeleteSpecialDay();

  const [storeId, setStoreId] = useState("");
  const [day, setDay] = useState("");
  const [closed, setClosed] = useState(true);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!storeId || !day) {
      toast.error("Välj butik och datum.");
      return;
    }
    if (!closed && (!openTime || !closeTime)) {
      toast.error("Ange både öppnings- och stängningstid.");
      return;
    }
    try {
      await save.mutateAsync({
        store_id: storeId,
        storeName: stores.find((s) => s.id === storeId)?.name,
        day,
        closed,
        open_time: openTime || null,
        close_time: closeTime || null,
        note: note.trim() || null,
      });
      toast.success(closed ? "Dagen är stängd för bokning." : "Avvikande öppettider sparade.");
      setDay("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara dagen.");
    }
  };

  const byStore = stores.map((s) => ({ store: s, rows: days.filter((d) => d.store_id === s.id) }));

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Helgdagskalender</h1>
        <p className="text-xs text-muted-foreground">
          Avvikande öppettider och stängda dagar per butik. Stängda dagar går inte att boka på
          bokningssidan.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ny avvikande dag</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label className="text-xs">Butik</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-9">
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
          <div>
            <Label className="text-xs">Datum</Label>
            <Input className="h-9" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Switch checked={closed} onCheckedChange={setClosed} />
            <span className="text-xs">{closed ? "Stängt" : "Ändrade tider"}</span>
          </div>
          <div>
            <Label className="text-xs">Öppnar</Label>
            <Input
              className="h-9 font-mono"
              type="time"
              disabled={closed}
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Stänger</Label>
            <Input
              className="h-9 font-mono"
              type="time"
              disabled={closed}
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
          </div>
          <div className="md:col-span-5">
            <Label className="text-xs">Anteckning (visas för kunden)</Label>
            <Input
              className="h-9"
              placeholder="t.ex. Midsommarafton"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="h-9 w-full" onClick={submit} disabled={save.isPending}>
              Spara dag
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Hämtar kalendern…</p>
      ) : (
        byStore.map(({ store, rows }) => (
          <Card key={store.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{store.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Inga avvikande dagar framåt. Butiken följer sina vanliga öppettider.
                </p>
              ) : (
                rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-grid-line px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      {r.closed && <CalendarOff className="h-4 w-4 text-destructive" />}
                      <span className="text-sm capitalize">{dayLabel(r.day)}</span>
                      {r.closed ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Stängt
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {String(r.open_time).slice(0, 5)}–{String(r.close_time).slice(0, 5)}
                        </Badge>
                      )}
                      {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(r.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
