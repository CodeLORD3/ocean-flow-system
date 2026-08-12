import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, PackageSearch } from "lucide-react";
import { allocateFefo, type FefoLot, type FefoAllocationResult } from "@/lib/fefo";
import { fmt } from "@/lib/filletMath";

/**
 * FEFO-partival. Partier med saldo > 0 listas med kortast hållbarhet först,
 * översta partiet är förvalt. Räcker det inte delas uttaget automatiskt över
 * nästa parti i FEFO-ordning och fördelningen visas före bekräftelse. Väljer
 * användaren ett annat parti än förslaget varnas det, men valet tillåts.
 */
export interface LotPickerProps {
  lots: FefoLot[];
  quantityKg: number;
  loading?: boolean;
  /** Rapporterar aktuell fördelning uppåt. */
  onChange?: (result: FefoAllocationResult & { startLotId: string | null }) => void;
  emptyHint?: string;
}

export function LotPicker({ lots, quantityKg, loading, onChange, emptyHint }: LotPickerProps) {
  const [startLotId, setStartLotId] = useState<string | null>(null);

  const suggestedLotId = lots[0]?.lotId ?? null;

  // Förval: översta partiet i FEFO-ordning. Nollställs om partiet försvinner.
  useEffect(() => {
    if (!startLotId || !lots.some((l) => l.lotId === startLotId)) setStartLotId(suggestedLotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedLotId, lots.length]);

  const result = useMemo(
    () => allocateFefo(lots, quantityKg, startLotId),
    [lots, quantityKg, startLotId],
  );

  useEffect(() => {
    onChange?.({ ...result, startLotId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.allocations.map((a) => `${a.lotId}:${a.quantityKg}`).join("|"), result.shortBy, startLotId]);

  const allocFor = (lotId: string) => result.allocations.find((a) => a.lotId === lotId)?.quantityKg ?? 0;

  if (loading) return <p className="text-[11px] text-muted-foreground">Hämtar partier…</p>;

  if (lots.length === 0)
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-[11px] text-muted-foreground">
        <PackageSearch className="mt-0.5 h-3.5 w-3.5" />
        <span>{emptyHint ?? "Inga partier med saldo på lagerplatsen — bokför en inleverans eller flytta in råvaran först."}</span>
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-[11px]">Parti</TableHead>
              <TableHead className="text-[11px]">Ankomst</TableHead>
              <TableHead className="text-[11px]">Leverantör</TableHead>
              <TableHead className="text-right text-[11px]">Kvar (kg)</TableHead>
              <TableHead className="text-[11px]">Bäst före</TableHead>
              <TableHead className="text-[11px]">Fångstzon</TableHead>
              <TableHead className="text-right text-[11px]">Uttag (kg)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((l, i) => {
              const take = allocFor(l.lotId);
              return (
                <TableRow
                  key={l.lotId}
                  className={take > 0 ? "bg-muted/40" : undefined}
                  onClick={() => setStartLotId(l.lotId)}
                  role="button"
                >
                  <TableCell className="py-1.5">
                    <input
                      type="radio"
                      aria-label={`Välj parti ${l.lotNumber}`}
                      checked={startLotId === l.lotId}
                      onChange={() => setStartLotId(l.lotId)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-[11px]">
                    {l.lotNumber}
                    {i === 0 && (
                      <Badge variant="outline" className="ml-1.5 text-[9px]">FEFO</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">{l.arrivedAt?.slice(0, 10) ?? "—"}</TableCell>
                  <TableCell className="py-1.5 text-[11px]">{l.supplierName ?? "—"}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                    {fmt(l.quantityKg, 1)}
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">{l.bestBefore ?? "—"}</TableCell>
                  <TableCell className="py-1.5 text-[11px]">{l.catchArea ?? "—"}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                    {take > 0 ? fmt(take, 1) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {result.allocations.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Uttaget delas över {result.allocations.length} partier:{" "}
          {result.allocations.map((a) => `${a.lotNumber} ${fmt(a.quantityKg, 1)} kg`).join(" · ")}
        </p>
      )}
      {result.manualDeviation && (
        <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-600">
          <AlertTriangle className="h-3 w-3" /> Manuellt avsteg från FEFO — partiet {lots[0]?.lotNumber} har kortare
          hållbarhet ({lots[0]?.bestBefore ?? "okänt"}) och borde plockas först
        </Badge>
      )}
      {!result.fullyAllocated && (
        <Badge variant="outline" className="gap-1 border-destructive text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" /> Partierna räcker inte — {fmt(result.shortBy, 1)} kg saknas
        </Badge>
      )}
    </div>
  );
}
