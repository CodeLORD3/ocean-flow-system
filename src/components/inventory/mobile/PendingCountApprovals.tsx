import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usePendingCountReports } from "@/hooks/useMobileStockCount";
import { approveCountReport, diffText, fmtQty } from "@/lib/mobileCount";
import { useActiveUser } from "@/contexts/ActiveUserContext";

/**
 * Butikschefens godkännande. Först här bokförs justeringarna i lagret —
 * inskickade räkningar ligger bara och väntar tills någon godkänner.
 */
export default function PendingCountApprovals({ storeId }: { storeId?: string | null }) {
  const { activeUser } = useActiveUser();
  const pending = usePendingCountReports(storeId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reports = pending.data ?? [];
  if (!reports.length) return null;

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const res = await approveCountReport(id, activeUser?.id ?? null);
      toast.success(`Godkänd — ${res.written} varor justerade i lagret`);
      qc.invalidateQueries({ queryKey: ["pending-count-reports"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["count-places"] });
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte godkänna räkningen.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-[20px] font-semibold">Väntar på godkännande</h2>
      {reports.map((r: any) => {
        const lines = (r.inventory_report_lines ?? []) as any[];
        const diffs = lines.filter((l) => Number(l.diff_kg));
        const open = openId === r.id;
        return (
          <div key={r.id} className="rounded-2xl border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-500/10">
            <p className="font-heading text-[20px] font-semibold leading-tight">
              {r.location_name || "Lagerplats"}
            </p>
            <p className="text-[17px] text-muted-foreground">
              {r.reported_by ? `${r.reported_by} · ` : ""}
              {lines.length} varor, {diffs.length} avvikelser
            </p>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              className="mt-2 flex h-14 min-h-[56px] w-full items-center justify-center rounded-2xl border border-border bg-card text-[18px] font-semibold"
            >
              {open ? "Dölj raderna" : "Visa raderna"}
            </button>
            {open && (
              <ul className="mt-2 space-y-1">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 text-[17px]">
                    <span className="min-w-0 truncate">{l.product_name}</span>
                    <span className="shrink-0 tabular-nums">
                      {fmtQty(Number(l.counted_qty_kg) || 0, l.unit)}
                      {Number(l.diff_kg) ? ` · ${diffText(Number(l.diff_kg), l.unit)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => approve(r.id)}
              disabled={busy === r.id}
              className="mt-3 flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[19px] font-semibold text-white disabled:opacity-50"
            >
              {busy === r.id ? (
                "Godkänner…"
              ) : (
                <>
                  <ShieldCheck className="h-6 w-6" /> Godkänn och uppdatera lagret
                </>
              )}
            </button>
            <p className="mt-2 flex items-center gap-1.5 text-[15px] text-muted-foreground">
              <Check className="h-4 w-4" /> Lagret ändras först när du godkänner.
            </p>
          </div>
        );
      })}
    </div>
  );
}
