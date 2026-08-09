import { Lock } from "lucide-react";
import { LEVEL_ORDER, LEVEL_LABEL, LEVEL_DESCRIPTION, type LocationLevel } from "@/lib/locations";
import { cn } from "@/lib/utils";

export interface LevelTotals {
  quantityKg: number;
  value: number;
}

interface LevelSelectorProps {
  /** Nivåer användaren får hantera. Övriga visas i grått läge, aldrig gömda. */
  available: LocationLevel[];
  /** Nivåer som visas alls. Utelämnad = alla fem nivåer. */
  visible?: LocationLevel[];
  value: LocationLevel | "all";
  onChange: (level: LocationLevel | "all") => void;
  /** Kilo och lagervärde per nivå. Visas även för låsta nivåer. */
  totals?: Partial<Record<LocationLevel | "all", LevelTotals>>;
  /** Text som förklarar vem som äger en låst nivå, t.ex. "Hanteras av produktion". */
  lockedReason?: Partial<Record<LocationLevel, string>>;
  /** Döljer lagervärdet (butik ser inte inköpsvärden). */
  showValue?: boolean;
  includeAll?: boolean;
}

const kg = (v?: number) =>
  `${Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

const money = (v?: number) =>
  `${Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`;

/**
 * Nivåväljare för lagerstrukturen. Ordningen följer flödet:
 * inköp → grossist → tillverkning → leverans → butik.
 *
 * Se men inte röra: nivåer användaren inte får hantera visar saldo och värde
 * precis som de andra, men i grå ton med låsikon och avaktiverad knapp. En
 * gömd siffra skulle innebära att någon beställer vara som redan är uppbokad.
 */
export default function LevelSelector({
  available,
  visible,
  value,
  onChange,
  totals,
  lockedReason,
  showValue = true,
  includeAll = true,
}: LevelSelectorProps) {
  const shown = LEVEL_ORDER.filter((l) => !visible || visible.includes(l));
  const options: (LocationLevel | "all")[] = includeAll ? ["all", ...shown] : [...shown];

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const isAll = option === "all";
        const level = option as LocationLevel;
        const locked = !isAll && !available.includes(level);
        const active = option === value && !locked;
        const label = isAll ? "Alla nivåer" : LEVEL_LABEL[level];
        const hint = isAll
          ? "Hela enhetens lager"
          : locked
            ? (lockedReason?.[level] ?? "Hanteras av annan enhet")
            : LEVEL_DESCRIPTION[level];
        const t = totals?.[option];

        return (
          <button
            key={option}
            type="button"
            disabled={locked}
            aria-disabled={locked}
            onClick={() => !locked && onChange(option)}
            title={hint}
            className={cn(
              "min-w-[11rem] shrink-0 rounded-md border px-3 py-2 text-left transition-colors",
              locked
                ? "cursor-not-allowed border-dashed border-border bg-muted/40 text-muted-foreground/70 opacity-70"
                : active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1 truncate text-xs font-semibold">
              {locked && <Lock className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="truncate">{label}</span>
            </span>
            <span className="block font-mono text-[11px] tabular-nums">
              {kg(t?.quantityKg)}
              {showValue && <span className="ml-1 opacity-80">· {money(t?.value)}</span>}
            </span>
            <span className="mt-0.5 block text-[10px] leading-tight opacity-90">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
