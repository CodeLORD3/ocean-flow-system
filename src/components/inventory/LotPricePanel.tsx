import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

interface Props {
  lotId: string;
  lotNumber: string;
  currency?: string;
  unitCost: number | null;
  priceStatus?: string | null;
  preliminaryUnitCost?: number | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
}

const nf = (n: number, d = 2) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

/**
 * Fastställer partipriset när fakturan kommer. Lagervärde, dagssnitt och
 * partier som tillverkats ur partiet räknas om av databasfunktionen.
 */
export default function LotPricePanel({
  lotId,
  lotNumber,
  currency = "SEK",
  unitCost,
  priceStatus,
  preliminaryUnitCost,
  invoiceNumber,
  invoiceDate,
}: Props) {
  const qc = useQueryClient();
  const final = (priceStatus || "preliminar") === "faststalld";
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(unitCost != null ? String(unitCost) : "");
  const [invoice, setInvoice] = useState(invoiceNumber || "");
  const [date, setDate] = useState(invoiceDate || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(String(price).replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Ange ett giltigt fakturapris per kilo");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("finalize_lot_price", {
      _lot_id: lotId,
      _final_unit_cost: value,
      _invoice_number: invoice.trim() || null,
      _invoice_date: date || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Kunde inte fastställa priset");
      return;
    }
    toast.success(`Partipriset fastställt för ${lotNumber}`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["lots_traceability"] });
    qc.invalidateQueries({ queryKey: ["lot_movements", lotId] });
    qc.invalidateQueries({ queryKey: ["stock_tree"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Receipt className="h-3.5 w-3.5 text-primary" /> Inköpspris
          </span>
          <Badge variant={final ? "secondary" : "outline"} className="text-[10px]">
            {final ? "Fastställt fakturapris" : "Preliminärt pris"}
          </Badge>
          {unitCost != null && (
            <span className="font-mono tabular-nums">
              {nf(Number(unitCost))} {currency}/kg
            </span>
          )}
          {final && preliminaryUnitCost != null && (
            <span className="font-mono tabular-nums">
              (prel. {nf(Number(preliminaryUnitCost))} {currency}/kg)
            </span>
          )}
          {invoiceNumber && <span>Faktura {invoiceNumber}</span>}
          {invoiceDate && <span>{invoiceDate}</span>}
        </div>
        <Button size="sm" variant={final ? "outline" : "default"} className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
          {final ? "Justera fakturapris" : "Fastställ fakturapris"}
        </Button>
      </div>

      {open && (
        <div className="mt-2 grid gap-2 rounded-md border border-border bg-muted/30 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Fakturapris {currency}/kg</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="h-8 font-mono tabular-nums"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Fakturanummer</Label>
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Fakturadatum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
              {saving ? "Sparar…" : "Spara"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground sm:col-span-4">
            Lagervärde, dagssnittpris och kostnaden på partier som tillverkats ur detta parti räknas om automatiskt.
          </p>
        </div>
      )}
    </div>
  );
}
