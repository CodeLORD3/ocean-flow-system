import * as React from "react";
import { cn } from "@/lib/utils";

export type ResponsiveColumn<T> = {
  /** Unik nyckel för kolumnen. */
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Rubrikrad i mobilkortet (visas stort utan etikett). */
  primary?: boolean;
  /** Döljs helt i mobilkortet. */
  hideOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
};

type Props<T> = {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
};

/**
 * Tabell på dator, staplade kort på mobil — samma data, inget sidoskroll och
 * tillräckligt stora tryckytor i telefonen.
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
}: Props<T>) {
  if (!rows.length) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        {empty ?? "Inget att visa."}
      </div>
    );
  }

  const mobileCols = columns.filter((c) => !c.hideOnMobile);
  const primary = mobileCols.find((c) => c.primary) ?? mobileCols[0];
  const secondary = mobileCols.filter((c) => c !== primary);

  return (
    <div className={className}>
      {/* Mobil — kort */}
      <div className="sm:hidden divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn("px-3 py-2.5 space-y-1.5", onRowClick && "active:bg-muted/60")}
          >
            <div className="text-[13px] font-semibold leading-tight">{primary.cell(row)}</div>
            {secondary.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {secondary.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                      {c.header}
                    </dt>
                    <dd className="text-[12px]">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      {/* Dator — tabell */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                    c.headerClassName,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/40")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-2 py-1.5 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ResponsiveTable;
