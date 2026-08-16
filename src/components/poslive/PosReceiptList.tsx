import { useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PAYMENT_LABEL, usePosTransactionItems, type PosTransaction } from "@/hooks/usePosLive";

const kr = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

function ReceiptRows({ id }: { id: string }) {
  const { data: items = [], isLoading } = usePosTransactionItems(id);
  if (isLoading)
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1 py-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Laddar rader…
      </p>
    );
  if (items.length === 0) return <p className="text-xs text-muted-foreground py-1">Inga rader.</p>;
  return (
    <div className="space-y-0.5 py-1">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2 text-xs">
          <span className="font-mono tabular-nums text-muted-foreground w-16 text-right">
            {it.quantity} {it.unit}
          </span>
          <span className="flex-1 truncate text-foreground">{it.product_name}</span>
          {!it.product_id && (
            <Badge variant="outline" className="text-[9px] text-warning border-warning/40">
              omatchad
            </Badge>
          )}
          <span className="font-mono tabular-nums text-foreground">{kr(it.line_total_ore / 100)}</span>
        </div>
      ))}
    </div>
  );
}

const RECEIPT_BADGES = (r: PosTransaction) => (
  <>
    {r.test_mode && (
      <Badge variant="outline" className="text-[9px] text-muted-foreground">
        test
      </Badge>
    )}
    {r.type === "return" && (
      <Badge variant="outline" className="text-[9px] text-warning border-warning/40">
        retur
      </Badge>
    )}
  </>
);

/** Live-lista över kvitton, expanderbar per kvitto. */
export function PosReceiptList({
  rows,
  storeName,
}: {
  rows: PosTransaction[];
  storeName: (id: string | null) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">Inga kvitton registrerade.</p>
    );

  return (
    <div className="divide-y divide-border">
      {rows.map((t) => {
        const isReturn = t.status !== "completed" || t.total_ore < 0;
        return (
          <div key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(open === t.id ? null : t.id)}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/40 px-1 rounded"
            >
              <span className="font-mono tabular-nums text-xs text-muted-foreground w-10">
                {time(t.occurred_at)}
              </span>
              <span className="text-xs text-foreground w-36 truncate">{storeName(t.store_id)}</span>
              <span className="font-mono text-[11px] text-muted-foreground w-24 truncate">
                #{t.external_receipt_no || t.receipt_no}
              </span>
              <span className="text-[11px] text-muted-foreground w-16 truncate">
                {PAYMENT_LABEL[t.payment_method] ?? t.payment_method}
              </span>
              {t.source !== "internal" && (
                <Badge variant="outline" className="text-[9px]">
                  {t.source}
                </Badge>
              )}
              {isReturn && (
                <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40">
                  retur
                </Badge>
              )}
              <span
                className={cn(
                  "ml-auto font-mono tabular-nums text-sm",
                  isReturn ? "text-destructive" : "text-foreground",
                )}
              >
                {kr(t.total_ore / 100)}
              </span>
              <Receipt className="h-3 w-3 text-muted-foreground" />
            </button>
            {open === t.id && (
              <div className="pl-12 pr-2 pb-2">
                <ReceiptRows id={t.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
