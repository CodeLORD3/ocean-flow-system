import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeftRight, Plus, Settings2 } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useStorageLocations } from "@/hooks/useStorageLocations";
import { useTransferOrders, type TransferOrderRow } from "@/hooks/useTransferOrders";
import { usePicklistAlarmHours, useSetPicklistAlarmHours } from "@/hooks/useSystemSettings";
import TransferFlowDialog, { STATUS_LABEL } from "@/components/inventory/TransferFlowDialog";
import NewTransferDialog from "@/components/inventory/NewTransferDialog";
import LevelSelector from "@/components/inventory/LevelSelector";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { EmptyState } from "@/components/EmptyState";

/**
 * Överföringar mellan lagernivåer. Sidan visar hela kedjan i ett flöde och
 * larmar för plocklistor som skrivits ut men aldrig registrerats.
 */
export default function StockTransfers() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: locations = [] } = useStorageLocations(activeStoreId || "all");
  const locationIds = useMemo(
    () => (activeStoreId ? (locations as any[]).map((l: any) => l.id) : undefined),
    [locations, activeStoreId],
  );
  const { data: orders = [], isLoading } = useTransferOrders(locationIds);
  const { hours } = usePicklistAlarmHours();
  const setHours = useSetPicklistAlarmHours();
  const [hoursDraft, setHoursDraft] = useState<string>("");

  const [level, setLevel] = useState<LocationLevel | "all">("all");
  const [openOrder, setOpenOrder] = useState<TransferOrderRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const availableLevels = useMemo(
    () =>
      Array.from(
        new Set((locations as any[]).map((l: any) => l.location_type).filter(Boolean)),
      ) as LocationLevel[],
    [locations],
  );

  const filtered = useMemo(() => {
    const rows = orders as TransferOrderRow[];
    if (level === "all") return rows;
    return rows.filter(
      (o) => o.from_location?.location_type === level || o.to_location?.location_type === level,
    );
  }, [orders, level]);

  const overdue = useMemo(() => {
    const limit = hours * 3600_000;
    return (orders as TransferOrderRow[]).filter(
      (o) =>
        o.status === "plocklista_utskriven" &&
        !o.picked_at &&
        o.picklist_printed_at &&
        Date.now() - new Date(o.picklist_printed_at).getTime() > limit,
    );
  }, [orders, hours]);

  const hoursSince = (iso?: string | null) =>
    iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000) : 0;

  const saveHours = async () => {
    try {
      const v = Number(hoursDraft.replace(",", "."));
      await setHours.mutateAsync(v);
      toast.success(`Larmgränsen är nu ${v} timmar.`);
    } catch (e: any) {
      toast.error(e.message || "Kunde inte spara larmgränsen.");
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
            <ArrowLeftRight className="h-5 w-5 text-primary" /> Överföringar
          </h1>
          <p className="text-xs text-muted-foreground">
            Flytt mellan lagernivåer med plocklista, utleverans och inleverans
            {activeStoreName ? ` — ${activeStoreName}` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Popover onOpenChange={(v) => v && setHoursDraft(String(hours))}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                <Settings2 className="h-3 w-3" /> Larmgräns: {hours} h
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2">
              <Label className="text-xs">Timmar innan oregistrerad plocklista larmar</Label>
              <p className="text-[11px] text-muted-foreground">
                Fyra timmar passar en morgonleverans. Skrivs plocklistan ut på eftermiddagen inför
                nästa dag behövs en högre gräns.
              </p>
              <div className="flex gap-2">
                <Input
                  value={hoursDraft}
                  onChange={(e) => setHoursDraft(e.target.value)}
                  className="h-8 w-20 font-mono text-xs tabular-nums"
                  inputMode="decimal"
                />
                <Button size="sm" className="h-8 text-xs" onClick={saveHours} disabled={setHours.isPending}>
                  Spara
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setNewOpen(true)}>
            <Plus className="h-3 w-3" /> Ny överföring
          </Button>
        </div>
      </div>

      {overdue.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">
            {overdue.length} plocklista{overdue.length === 1 ? "" : "or"} utan registrerad plockning
          </AlertTitle>
          <AlertDescription className="text-xs">
            <ul className="mt-1 space-y-1">
              {overdue.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setOpenOrder(o)}
                  >
                    {o.order_number}
                  </button>{" "}
                  — utskriven för {hoursSince(o.picklist_printed_at)} h sedan från{" "}
                  {o.from_location?.name}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <LevelSelector available={availableLevels} value={level} onChange={setLevel} />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Hämtar överföringar…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              bare
              title="Inga överföringar än"
              description="En överföring skapas när varan ska byta lagernivå. Saldot flyttas först när mottagaren godkänt inleveransen."
              actionLabel="Ny överföring"
              onAction={() => setNewOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Order</th>
                    <th className="p-2 text-left font-medium">Från</th>
                    <th className="p-2 text-left font-medium">Till</th>
                    <th className="p-2 text-right font-medium">Rader</th>
                    <th className="p-2 text-left font-medium">Status</th>
                    <th className="p-2 text-left font-medium">Skapad</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="p-2 font-mono text-[11px]">{o.order_number}</td>
                      <td className="p-2">
                        {o.from_location?.name}
                        <span className="block text-[11px] text-muted-foreground">
                          {LEVEL_LABEL[o.from_location?.location_type as LocationLevel] ?? ""}
                        </span>
                      </td>
                      <td className="p-2">
                        {o.to_location?.name}
                        <span className="block text-[11px] text-muted-foreground">
                          {LEVEL_LABEL[o.to_location?.location_type as LocationLevel] ?? ""}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums">
                        {o.transfer_order_lines?.length ?? 0}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            o.status === "avvisad"
                              ? "destructive"
                              : o.status === "godkand_inleverans"
                                ? "outline"
                                : "secondary"
                          }
                          className="text-[11px]"
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("sv-SE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setOpenOrder(o)}
                        >
                          Öppna
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TransferFlowDialog
        order={
          openOrder
            ? ((orders as TransferOrderRow[]).find((o) => o.id === openOrder.id) ?? openOrder)
            : null
        }
        onOpenChange={(v) => !v && setOpenOrder(null)}
      />
      <NewTransferDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        locations={locations as any[]}
      />
    </div>
  );
}
