import { useEffect, useState } from "react";
import { Clock, Save } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  WEEKDAY_LABELS,
  WEEK_ORDER,
  useSaveOpeningHours,
  useStoreOpeningHours,
  type OpeningHourInput,
} from "@/hooks/useStoreOpeningHours";

const DEFAULT_WEEK: OpeningHourInput[] = WEEK_ORDER.map((weekday) => ({
  weekday,
  open_time: weekday === 0 ? null : "10:00",
  close_time: weekday === 0 ? null : "18:00",
  closed: weekday === 0,
}));

/** Öppettider per veckodag för en butik — underlaget till Live personal-timelinen. */
export function StoreOpeningHoursDialog({
  storeId,
  storeName,
  open,
  onOpenChange,
}: {
  storeId: string | null;
  storeName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: rows = [] } = useStoreOpeningHours(storeId);
  const save = useSaveOpeningHours();
  const { toast } = useToast();
  const [week, setWeek] = useState<OpeningHourInput[]>(DEFAULT_WEEK);

  useEffect(() => {
    if (!open) return;
    setWeek(
      WEEK_ORDER.map((weekday) => {
        const row = rows.find((r) => r.weekday === weekday);
        if (!row) return DEFAULT_WEEK.find((d) => d.weekday === weekday)!;
        return {
          weekday,
          closed: row.closed,
          open_time: row.open_time ? row.open_time.slice(0, 5) : "",
          close_time: row.close_time ? row.close_time.slice(0, 5) : "",
        };
      }),
    );
  }, [open, rows]);

  const update = (weekday: number, patch: Partial<OpeningHourInput>) =>
    setWeek((w) => w.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  const handleSave = () => {
    if (!storeId) return;
    const invalid = week.find(
      (d) => !d.closed && (!d.open_time || !d.close_time || d.open_time >= d.close_time),
    );
    if (invalid) {
      toast({
        title: "Kontrollera tiderna",
        description: `${WEEKDAY_LABELS[invalid.weekday]} saknar giltig öppettid.`,
        variant: "destructive",
      });
      return;
    }
    save.mutate(
      { storeId, week },
      {
        onSuccess: () => {
          toast({ title: "Öppettider sparade", description: storeName });
          onOpenChange(false);
        },
        onError: (e: any) => toast({ title: "Fel", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" /> Öppettider · {storeName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {week.map((d) => (
            <div key={d.weekday} className="flex items-center gap-2 rounded-md border border-border p-2">
              <span className="w-16 shrink-0 text-xs font-medium text-foreground">
                {WEEKDAY_LABELS[d.weekday]}
              </span>
              {d.closed ? (
                <span className="flex-1 text-xs text-muted-foreground">Stängt</span>
              ) : (
                <div className="flex flex-1 items-center gap-1.5">
                  <Input
                    type="time"
                    className="h-7 text-xs"
                    value={d.open_time ?? ""}
                    onChange={(e) => update(d.weekday, { open_time: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="time"
                    className="h-7 text-xs"
                    value={d.close_time ?? ""}
                    onChange={(e) => update(d.weekday, { close_time: e.target.value })}
                  />
                </div>
              )}
              <Switch
                checked={!d.closed}
                onCheckedChange={(v) => update(d.weekday, { closed: !v })}
                aria-label={`Öppet ${WEEKDAY_LABELS[d.weekday]}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
