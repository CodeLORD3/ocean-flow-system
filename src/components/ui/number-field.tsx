import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> & {
  /** Värdet som text — tillåter både komma och punkt medan man skriver. */
  value?: string | number | null;
  /** Heltal (styck) ger sifferbord utan decimaltecken. */
  integer?: boolean;
  onValueChange?: (raw: string, parsed: number | null) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

/** Tolkar svenskt tal, "1,5" → 1.5. Tomt fält ger null. */
export const parseNumber = (raw: string): number | null => {
  const t = String(raw ?? "").replace(/\s/g, "").replace(",", ".").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Sifferfält för mobil: öppnar telefonens numeriska tangentbord, inga snurrpilar
 * och komma tillåtet. Större tryckyta på mobil, kompakt på dator.
 */
export const NumberField = React.forwardRef<HTMLInputElement, Props>(
  ({ className, integer, value, onValueChange, onChange, ...rest }, ref) => (
    <Input
      ref={ref}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      pattern={integer ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
      autoComplete="off"
      enterKeyHint="done"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => {
        onChange?.(e);
        onValueChange?.(e.target.value, parseNumber(e.target.value));
      }}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn(
        "h-10 sm:h-8 text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className,
      )}
      {...rest}
    />
  ),
);
NumberField.displayName = "NumberField";

export default NumberField;
