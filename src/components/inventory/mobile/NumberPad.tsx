import { Delete } from "lucide-react";

/**
 * Stor egen knappsats. Telefonens tangentbord används aldrig — händerna kan
 * vara våta eller kalla, så varje knapp är minst 56 px hög.
 */
export default function NumberPad({
  value,
  onChange,
  allowDecimal = true,
}: {
  value: string;
  onChange: (next: string) => void;
  allowDecimal?: boolean;
}) {
  const press = (key: string) => {
    if (key === "del") return onChange(value.slice(0, -1));
    if (key === ",") {
      if (!allowDecimal || value.includes(",")) return;
      return onChange(value === "" ? "0," : `${value},`);
    }
    if (value === "0") return onChange(key);
    // Max en decimal på mängder.
    if (value.includes(",") && value.split(",")[1].length >= 1) return;
    if (value.replace(",", "").length >= 6) return;
    onChange(value + key);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDecimal ? "," : "", "0", "del"];

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={`empty-${i}`} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "del" ? "Radera siffra" : k === "," ? "Komma" : k}
            className="flex h-16 min-h-[56px] items-center justify-center rounded-2xl border border-border bg-card text-[26px] font-semibold tabular-nums shadow-sm active:bg-muted"
          >
            {k === "del" ? <Delete className="h-7 w-7" /> : k}
          </button>
        ),
      )}
    </div>
  );
}
