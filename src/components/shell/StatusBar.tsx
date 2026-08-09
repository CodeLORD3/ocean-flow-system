/**
 * Statusrad i botten av listsidan, som i Dynamics 365: hur många rader som
 * är markerade och vad de summerar till.
 */
export function StatusBar({
  selectedCount,
  totalCount,
  selectedSum,
  extra,
}: {
  selectedCount: number;
  totalCount: number;
  selectedSum?: number;
  extra?: string;
}) {
  const nf = (v: number) =>
    v.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-grid-line bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-mono tabular-nums">
        {selectedCount} av {totalCount} rader markerade
      </span>
      {selectedCount > 0 && typeof selectedSum === "number" && (
        <span className="font-mono tabular-nums">Summa valda: {nf(selectedSum)} kr</span>
      )}
      {extra && <span>{extra}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        Ansluten
      </span>
    </div>
  );
}
