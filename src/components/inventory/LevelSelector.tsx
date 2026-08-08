import { LEVEL_ORDER, LEVEL_LABEL, LEVEL_DESCRIPTION, type LocationLevel } from "@/lib/locations";
import { cn } from "@/lib/utils";

interface LevelSelectorProps {
  /** Nivåer som finns i den aktuella enheten. Övriga visas inte. */
  available: LocationLevel[];
  value: LocationLevel | "all";
  onChange: (level: LocationLevel | "all") => void;
  /** Antal kilo per nivå, visas som liten sifferrad under namnet. */
  totals?: Partial<Record<LocationLevel | "all", number>>;
  includeAll?: boolean;
}

const kg = (v?: number) =>
  v === undefined
    ? ""
    : `${Number(v).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

/**
 * Nivåväljare för lagerstrukturen. Ordningen följer flödet:
 * inköp → grossist → tillverkning → leverans → butik.
 */
export default function LevelSelector({
  available,
  value,
  onChange,
  totals,
  includeAll = true,
}: LevelSelectorProps) {
  const levels = LEVEL_ORDER.filter((l) => available.includes(l));
  const options: (LocationLevel | "all")[] = includeAll ? ["all", ...levels] : levels;

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const active = option === value;
        const label = option === "all" ? "Alla nivåer" : LEVEL_LABEL[option];
        const hint =
          option === "all" ? "Hela enhetens lager" : LEVEL_DESCRIPTION[option as LocationLevel];
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            title={hint}
            className={cn(
              "min-w-[9rem] shrink-0 rounded-md border px-3 py-2 text-left transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="block truncate text-xs font-semibold">{label}</span>
            <span className="block font-mono text-[11px] tabular-nums">
              {kg(totals?.[option])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
