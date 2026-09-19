import { Minus, Plus } from "lucide-react";
import { fmtQty } from "@/lib/mobileCount";
import { jarsToKg, kgToJars } from "@/lib/countPack";

/**
 * Stegare med stora knappar och stort siffervärde. Kilo räknas i steg om ett
 * halvt kilo, styck i hela stycken. Burkar (såser i Schweiz) räknas i hela
 * burkar — värdet utåt är alltid kilo.
 */
export default function CountStepper({
  value,
  unit,
  onChange,
  packKg,
}: {
  value: number;
  unit: string;
  onChange: (next: number) => void;
  /** Sätt vikten per burk för att räkna i burkar i stället för kilo. */
  packKg?: number | null;
}) {
  const jarMode = !!packKg && packKg > 0;
  const step = jarMode ? 1 : unit === "st" ? 1 : 0.5;
  const shown = jarMode ? kgToJars(value, packKg!) : value;
  const set = (nextShown: number) => {
    const clamped = Math.max(0, nextShown);
    onChange(jarMode ? jarsToKg(clamped, packKg!) : Math.round(clamped * 10) / 10);
  };

  return (
    <div className="flex items-stretch gap-3">
      <button
        type="button"
        onClick={() => set(shown - step)}
        aria-label="Minska"
        className="flex h-16 min-h-[56px] w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm active:bg-muted"
      >
        <Minus className="h-8 w-8" />
      </button>
      <div className="flex h-16 min-h-[56px] flex-1 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <span className="font-heading text-[30px] font-semibold tabular-nums leading-none">
          {jarMode ? shown : fmtQty(shown)}
        </span>
        <span className="ml-2 text-[18px] text-muted-foreground">
          {jarMode ? (shown === 1 ? "burk" : "burkar") : unit}
        </span>
      </div>
      <button
        type="button"
        onClick={() => set(shown + step)}
        aria-label="Öka"
        className="flex h-16 min-h-[56px] w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm active:bg-muted"
      >
        <Plus className="h-8 w-8" />
      </button>
    </div>
  );
}
