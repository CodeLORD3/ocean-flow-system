import { useFxRate } from "@/hooks/useFxRate";

const nf = (v: number, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Visar ett belopp i butikens valuta med SEK-motvärdet som referens, precis som
 * SumUp-vyerna: CHF står först, SEK visas som växling mot livekurs. Är butikens
 * valuta redan SEK visas bara ett belopp.
 */
export function CurrencyAmount({
  amount,
  currency,
  decimals = 2,
  className,
  sekClassName = "text-muted-foreground",
}: {
  amount: number;
  currency: string;
  decimals?: number;
  className?: string;
  sekClassName?: string;
}) {
  const code = (currency || "SEK").toUpperCase();
  const foreign = code !== "SEK";
  const { data: fx } = useFxRate(code, "SEK", foreign);

  return (
    <span className={className}>
      {nf(amount, decimals)} {code}
      {foreign && fx?.rate ? (
        <span className={`ml-1 font-normal ${sekClassName}`}>
          ≈ {nf(amount * fx.rate, decimals)} SEK
        </span>
      ) : null}
    </span>
  );
}

/** Livekurs för butikens valuta mot SEK — null när butiken redan är i SEK. */
export function useSekRate(currency: string) {
  const code = (currency || "SEK").toUpperCase();
  const { data } = useFxRate(code, "SEK", code !== "SEK");
  return code === "SEK" ? null : (data?.rate ?? null);
}
