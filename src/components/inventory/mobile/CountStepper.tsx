import { Minus, Plus } from "lucide-react";
import { fmtQty } from "@/lib/mobileCount";

/**
 * Stegare med stora knappar och stort siffervärde. Kilo räknas i steg om ett
 * halvt kilo, styck i hela stycken.
 */
export default function CountStepper({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const step = unit === "st" ? 1 : 0.5;
  const set = (next: number) => onChange(Math.max(0, Math.round(next * 10) / 10));

  return (
    <div className="flex items-stretch gap-3">
      <button
        type="button"
        onClick={() => set(value - step)}
        aria-label="Minska"
        className="flex h-16 min-h-[56px] w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm active:bg-muted"
      >
        <Minus className="h-8 w-8" />
      </button>
      <div className="flex h-16 min-h-[56px] flex-1 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <span className="font-heading text-[30px] font-semibold tabular-nums leading-none">
          {fmtQty(value)}
        </span>
        <span className="ml-2 text-[18px] text-muted-foreground">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => set(value + step)}
        aria-label="Öka"
        className="flex h-16 min-h-[56px] w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm active:bg-muted"
      >
        <Plus className="h-8 w-8" />
      </button>
    </div>
  );
}
