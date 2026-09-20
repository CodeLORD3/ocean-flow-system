import { useMemo, useState } from "react";
import { Loader2, Plus, Scissors, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useSplitAuctionLot } from "@/hooks/useAuctionPurchases";
import { lotSplitChildren, roundKg, splittableWeight } from "@/lib/auctionLotSplit";
import type { AuctionPurchaseRow } from "@/lib/auctionPurchases";

const kg = (n: number) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`;

export const SPLIT_DESTINATIONS = [
  { value: "stockholm", label: "Stockholm" },
  { value: "goteborg", label: "Göteborg" },
  { value: "export", label: "Export" },
] as const;

interface Part {
  amount: string;
  destination: string | null;
}

/**
 * Delar en låda i mindre delar vid fördelningen: 20 kg hel slätvar där Schweiz
 * ska ha 5,6 kg blir ett delparti på 5,6 kg och 14,4 kg kvar på moderpartiet.
 */
export default function SplitLotSheet({
  row,
  onClose,
}: {
  row: AuctionPurchaseRow;
  onClose: () => void;
}) {
  const split = useSplitAuctionLot();
  const total = splittableWeight(row);
  const [parts, setParts] = useState<Part[]>([{ amount: "", destination: null }]);
  const [error, setError] = useState<string | null>(null);

  const children = useQuery({
    queryKey: ["lot_split_children", row.lot_id],
    queryFn: () => lotSplitChildren(row.lot_id!),
    enabled: Boolean(row.lot_id),
  });

  const used = useMemo(
    () =>
      roundKg(
        parts.reduce((sum, p) => sum + (Number(String(p.amount).replace(",", ".")) || 0), 0),
      ),
    [parts],
  );
  const left = roundKg(total - used);

  const setPart = (i: number, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function spara() {
    setError(null);
    try {
      const result = await split.mutateAsync({
        row,
        parts: parts.map((p) => ({
          quantityKg: Number(String(p.amount).replace(",", ".")) || 0,
          destination: p.destination,
        })),
      });
      toast.success(
        `Partiet delat. ${kg(result.remainingKg)} kvar på lådan.`,
      );
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Delningen kunde inte sparas.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40">
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background p-4 pb-8">
        <p className="font-heading text-[22px] font-semibold">Dela partiet</p>
        <p className="mt-1 text-[17px] leading-snug text-muted-foreground">
          {row.lots?.commercial_name || "Ej tolkad"} · {row.colli} kolli · {kg(total)} i lådan.
          Varje del blir ett eget parti med samma fångstuppgifter.
        </p>

        <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-[15px] uppercase tracking-wide text-muted-foreground">
            Kvar att fördela
          </p>
          <p
            className={`font-heading text-[32px] font-semibold tabular-nums leading-tight ${
              left < 0 ? "text-destructive" : ""
            }`}
          >
            {kg(left)}
          </p>
        </div>

        {parts.map((part, i) => (
          <div key={i} className="mt-4 rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between">
              <label className="text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
                Del {i + 1} — kilo
              </label>
              {parts.length > 1 && (
                <button
                  type="button"
                  aria-label={`Ta bort del ${i + 1}`}
                  onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border text-muted-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <input
              value={part.amount}
              onChange={(e) => setPart(i, { amount: e.target.value.replace(/[^0-9.,]/g, "") })}
              inputMode="decimal"
              type="text"
              pattern="[0-9.,]*"
              placeholder="0,0"
              className="mt-2 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[32px] font-semibold tabular-nums outline-none focus:border-primary"
            />
            <div className="mt-3 flex gap-2">
              {SPLIT_DESTINATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() =>
                    setPart(i, { destination: part.destination === d.value ? null : d.value })
                  }
                  className={`h-16 min-h-[56px] flex-1 rounded-2xl border text-[18px] font-semibold ${
                    part.destination === d.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setParts((prev) => [...prev, { amount: "", destination: null }])}
          className="mt-3 flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[19px] font-semibold"
        >
          <Plus className="h-6 w-6" />
          Lägg till en del
        </button>

        {(children.data?.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
              Redan delat
            </p>
            {children.data!.map((c) => (
              <p key={c.id} className="mt-1 text-[17px] text-muted-foreground">
                {c.lot_number} · {kg(Number(c.quantity_kg ?? 0))}
                {c.auction_destination ? ` · ${c.auction_destination}` : ""}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[18px] font-semibold text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-16 flex-1 rounded-2xl border border-border bg-card text-[19px] font-semibold"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={spara}
            disabled={split.isPending || used <= 0 || left < 0}
            className="flex h-16 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {split.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Scissors className="h-6 w-6" />
            )}
            Dela
          </button>
        </div>
      </div>
    </div>
  );
}
