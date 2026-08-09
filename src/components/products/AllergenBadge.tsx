import { AlertTriangle } from "lucide-react";
import { allergenStatus, allergenName } from "@/lib/allergens";
import { cn } from "@/lib/utils";

interface Props {
  product: {
    allergens?: string[] | null;
    may_contain?: string[] | null;
    allergens_checked?: boolean | null;
  };
  className?: string;
}

/**
 * Kompakt allergenmärkning i listor.
 * Fetstil = deklarerat, normal = spår av, gul varning = inte kontrollerat.
 */
export function AllergenBadge({ product, className }: Props) {
  const { state, codes, mayContain } = allergenStatus(product);

  if (state === "unchecked")
    return (
      <span
        className={cn(
          "ml-1 flex shrink-0 items-center gap-0.5 rounded-sm border border-amber-500/50 bg-amber-500/10 px-1 text-[9px] text-amber-600 dark:text-amber-400",
          className,
        )}
        title="Allergener är inte kontrollerade på den här produkten"
      >
        <AlertTriangle className="h-2.5 w-2.5" /> allergen?
      </span>
    );

  if (state === "none") return null;

  const title = [
    codes.length ? `Innehåller: ${codes.map(allergenName).join(", ")}` : null,
    mayContain.length ? `Kan innehålla spår av: ${mayContain.map(allergenName).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <span className={cn("ml-1 flex shrink-0 items-center gap-1 text-[9px]", className)} title={title}>
      {codes.length > 0 && (
        <span className="rounded-sm border border-destructive/40 bg-destructive/10 px-1 font-semibold uppercase text-destructive">
          {codes.length} allergen
        </span>
      )}
      {mayContain.length > 0 && (
        <span className="rounded-sm border border-border px-1 text-muted-foreground">spår {mayContain.length}</span>
      )}
    </span>
  );
}
