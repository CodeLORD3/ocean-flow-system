import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> & {
  /** Värdet som text — tillåter både komma och punkt medan man skriver. */
  value?: string | number | null;
  /** Heltal (styck) ger sifferbord utan decimaltecken. */
  integer?: boolean;
  /** Tillåt minus (t.ex. frystemperatur, banksaldo). iPhones decimalbord saknar minus, därför textbord. */
  allowNegative?: boolean;
  onValueChange?: (raw: string, parsed: number | null) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

/** Tolkar svenskt tal, "1,5" → 1.5, "−2,5" → -2.5. Tomt fält ger null. */
export const parseNumber = (raw: string | number | null | undefined): number | null => {
  const t = String(raw ?? "").replace(/\s/g, "").replace(/[−–]/g, "-").replace(",", ".").trim();
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Sifferfält för mobil: öppnar telefonens numeriska tangentbord, inga snurrpilar
 * och komma tillåtet. Större tryckyta på mobil, kompakt på dator.
 */
const show = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;

export const NumberField = React.forwardRef<HTMLInputElement, Props>(
  ({ className, integer, allowNegative, value, onValueChange, onChange, ...rest }, ref) => {
    // Egen textbuffert så att "2," och "-" går att skriva även när föräldern sparar ett tal.
    const [text, setText] = React.useState(() => show(value));
    React.useEffect(() => {
      // Byt bara text när värdet verkligen ändrats utifrån ("2," och "2." är samma tal).
      if (parseNumber(text) !== parseNumber(value)) setText(show(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    return (
      <Input
        ref={ref}
        type="text"
        inputMode={allowNegative ? "text" : integer ? "numeric" : "decimal"}
        pattern={
          allowNegative
            ? integer ? "-?[0-9]*" : "-?[0-9]*[.,]?[0-9]*"
            : integer ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"
        }
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
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
    );
  },
);
NumberField.displayName = "NumberField";

export default NumberField;
