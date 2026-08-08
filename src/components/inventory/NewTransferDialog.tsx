import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import { useProductStockLocations } from "@/hooks/useStorageLocations";
import { useCreateTransferOrder } from "@/hooks/useTransferOrders";
import { EmptyState } from "@/components/EmptyState";

interface NewTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: any[];
  defaultFromId?: string | null;
}

const NO_LOT = "__utan_parti__";

/** Mottagare grupperas i den ordning de används: butiker, produktion, grossist. */
const RECIPIENT_GROUPS: { label: string; levels: LocationLevel[] }[] = [
  { label: "Butiker", levels: ["butik", "leveranslager"] },
  { label: "Produktion", levels: ["tillverkningslager"] },
  { label: "Grossist", levels: ["grossistlager", "inkopslager"] },
];

/**
 * Guidat skapande av en överföring: avsändare, mottagare, rader ur avsändarens
 * saldo. Databasen avgör om flödet mellan nivåerna är tillåtet, så en otillåten
 * kombination faller här med samma text som i triggern.
 */
export default function NewTransferDialog({
  open,
  onOpenChange,
  locations,
  defaultFromId,
}: NewTransferDialogProps) {
  const [fromId, setFromId] = useState<string>(defaultFromId ?? "");
  const [toId, setToId] = useState<string>("");
  const [toOpen, setToOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<Record<string, { qty: string; lotId: string }>>({});
  const create = useCreateTransferOrder();

  const { data: stock = [], isLoading } = useProductStockLocations(fromId || undefined);
  const rows = useMemo(
    () => (fromId ? (stock as any[]).filter((r) => Number(r.quantity) > 0) : []),
    [stock, fromId],
  );

  const { data: lotsByProduct = {} } = useQuery({
    queryKey: ["transfer_lot_balances", fromId, rows.map((r) => r.product_id).join(",")],
    enabled: Boolean(fromId) && rows.length > 0,
    queryFn: async () => {
      const out: Record<string, any[]> = {};
      const allIds: string[] = [];
      for (const row of rows) {
        const balances = await lotBalancesAtLocation(row.product_id, fromId);
        out[row.product_id] = balances;
        for (const b of balances) if (b.lotId) allIds.push(b.lotId);
      }
      // Partiets uppgifter hämtas en gång och hängs på varje rad, så att
      // användaren kan se ursprunget direkt i väljaren.
      if (allIds.length) {
        const { data } = await supabase
          .from("lots")
          .select("id, lot_number, catch_area, vessel_name, catch_date_from, best_before")
          .in("id", allIds);
        const meta = Object.fromEntries(((data ?? []) as any[]).map((l) => [l.id, l]));
        for (const key of Object.keys(out)) {
          out[key] = out[key].map((b: any) => ({ ...b, meta: b.lotId ? meta[b.lotId] : null }));
        }
      }
      return out;
    },
  });

  const locationLabel = (loc: any) =>
    `${loc.name} — ${LEVEL_LABEL[loc.location_type as LocationLevel] ?? "okänd nivå"}${
      loc.stores?.name ? ` (${loc.stores.name})` : ""
    }`;

  const recipientGroups = useMemo(() => {
    const candidates = locations.filter((l) => l.id !== fromId);
    const grouped = RECIPIENT_GROUPS.map((g) => ({
      label: g.label,
      items: candidates.filter((l) => g.levels.includes(l.location_type)),
    })).filter((g) => g.items.length > 0);
    const covered = new Set(grouped.flatMap((g) => g.items.map((i: any) => i.id)));
    const rest = candidates.filter((l) => !covered.has(l.id));
    return rest.length ? [...grouped, { label: "Övriga", items: rest }] : grouped;
  }, [locations, fromId]);

  const selectedTo = locations.find((l) => l.id === toId);

  const toggle = (productId: string, on: boolean, available: number) =>
    setPicked((prev) => {
      const next = { ...prev };
      if (on) next[productId] = { qty: String(available), lotId: NO_LOT };
      else delete next[productId];
      return next;
    });

  const reset = () => {
    setPicked({});
    setReason("");
    setToId("");
  };

  const submit = async () => {
    const lines = Object.entries(picked)
      .map(([productId, sel]) => ({
        productId,
        lotId: sel.lotId === NO_LOT ? null : sel.lotId,
        quantityOrdered: Number(String(sel.qty).replace(",", ".")) || 0,
      }))
      .filter((l) => l.quantityOrdered > 0);

    if (!fromId || !toId) {
      toast.error("Välj både avsändande och mottagande lagerplats.");
      return;
    }
    if (!lines.length) {
      toast.error("Markera minst en rad med kvantitet.");
      return;
    }

    try {
      const order = await create.mutateAsync({
        fromLocationId: fromId,
        toLocationId: toId,
        sourceDocumentType: "internal_transfer",
        sourceDocumentId: null,
        reason: reason.trim() || null,
        lines,
      });
      toast.success(`Överföring ${order.order_number} skapad. Nästa steg: skriv ut plocklistan.`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Överföringen kunde inte skapas.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : (reset(), onOpenChange(false)))}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Ny överföring</DialogTitle>
          <DialogDescription className="text-xs">
            Saldon ändras först när mottagaren godkänt inleveransen. Fram till dess ligger varan
            kvar på avsändarens lager.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Från</Label>
            <Select
              value={fromId}
              onValueChange={(v) => {
                setFromId(v);
                setPicked({});
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Välj avsändande lagerplats" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id} className="text-xs">
                    {locationLabel(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Till</Label>
            <Popover open={toOpen} onOpenChange={setToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-9 w-full justify-between text-xs font-normal"
                >
                  <span className="truncate">
                    {selectedTo ? locationLabel(selectedTo) : "Sök mottagare — butik, produktion…"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Skriv butiksnamn eller lagerplats…" className="text-xs" />
                  <CommandList>
                    <CommandEmpty className="p-3 text-xs">Ingen mottagare matchar sökningen.</CommandEmpty>
                    {recipientGroups.map((group) => (
                      <CommandGroup key={group.label} heading={group.label}>
                        {group.items.map((l: any) => (
                          <CommandItem
                            key={l.id}
                            value={`${l.name} ${l.stores?.name ?? ""} ${LEVEL_LABEL[l.location_type as LocationLevel] ?? ""}`}
                            onSelect={() => {
                              setToId(l.id);
                              setToOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={`mr-2 h-3 w-3 ${toId === l.id ? "opacity-100" : "opacity-0"}`}
                            />
                            {locationLabel(l)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Orsak (krävs för vissa flöden, till exempel retur)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Till exempel: retur av felplock"
            className="h-9 text-xs"
          />
        </div>

        <div className="rounded-md border">
          {!fromId ? (
            <EmptyState
              bare
              title="Välj avsändande lagerplats"
              description="Raderna hämtas ur avsändarens saldo, så inget kan skickas som inte finns i lagret."
            />
          ) : isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Hämtar saldo…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              bare
              title="Lagerplatsen är tom"
              description="Det finns inget saldo att skicka härifrån. Bokför en inleverans eller välj en annan avsändare."
            />
          ) : (
            <>
              <p className="border-b bg-muted/30 p-2 text-[11px] text-muted-foreground">
                Välj parti på varje rad. Partiet bär fångstområde, fartyg och bäst före — det följer
                varan hela vägen till hyllan och är det som gör spårbarheten möjlig vid en
                reklamation. Väljs "Utan parti" bryts kedjan.
              </p>
              <div className="divide-y">
                {rows.map((row) => {
                  const sel = picked[row.product_id];
                  const lots = ((lotsByProduct as any)[row.product_id] ?? []) as any[];
                  const activeLot = lots.find((l) => l.lotId === sel?.lotId);
                  return (
                    <div key={row.id} className="flex flex-wrap items-center gap-2 p-2 text-xs">
                      <Checkbox
                        checked={Boolean(sel)}
                        onCheckedChange={(v) =>
                          toggle(row.product_id, Boolean(v), Number(row.quantity))
                        }
                      />
                      <span className="min-w-[10rem] flex-1 truncate font-medium">
                        {row.products?.name ?? "Produkt"}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {Number(row.quantity).toLocaleString("sv-SE", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                        kg i lager
                      </span>
                      {sel && (
                        <>
                          <Input
                            value={sel.qty}
                            onChange={(e) =>
                              setPicked((p) => ({
                                ...p,
                                [row.product_id]: { ...sel, qty: e.target.value },
                              }))
                            }
                            className="h-8 w-24 font-mono text-xs tabular-nums"
                            inputMode="decimal"
                          />
                          <Select
                            value={sel.lotId}
                            onValueChange={(v) =>
                              setPicked((p) => ({
                                ...p,
                                [row.product_id]: { ...sel, lotId: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-44 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_LOT} className="text-xs">
                                Utan parti — spårbarheten bryts
                              </SelectItem>
                              {lots.map((lot: any) => (
                                <SelectItem key={lot.lotId} value={lot.lotId} className="text-xs">
                                  {lot.meta?.lot_number ?? "Parti"} — {lot.quantityKg} kg
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {activeLot?.meta && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <Info className="h-3.5 w-3.5 text-primary" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 space-y-1 text-xs">
                                <p className="font-mono text-[11px]">
                                  {activeLot.meta.lot_number ?? "Parti"}
                                </p>
                                <p>Fångstområde: {activeLot.meta.catch_area ?? "—"}</p>
                                <p>Fartyg: {activeLot.meta.vessel_name ?? "—"}</p>
                                <p>Fångstdatum: {activeLot.meta.catch_date_from ?? "—"}</p>
                                <p>Bäst före: {activeLot.meta.best_before ?? "—"}</p>
                              </PopoverContent>
                            </Popover>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Skapar…" : "Skapa överföring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
