import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSek, sekToOre } from "../lib/money";
import { Banknote, CreditCard, Smartphone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCashier } from "../store/cashier";
import { useCart, type CartLine } from "../store/cart";
import { stubPaymentTerminal, stubCloudKontrollenhet } from "../adapters/stubs";
import { toast } from "sonner";
import Receipt, { type ReceiptData } from "./Receipt";

type Method = "kontant" | "kort" | "swish";

export default function PaymentDialog({
  totalOre,
  lines,
  vatBreakdown,
  onClose,
}: {
  totalOre: number;
  lines: CartLine[];
  vatBreakdown: { rate: number; gross: number; net: number; vat: number }[];
  onClose: () => void;
}) {
  const cashier = useCashier((s) => s.cashier);
  const cartClear = useCart((s) => s.clear);

  const [method, setMethod] = useState<Method>("kontant");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const tenderedOre = sekToOre(parseFloat(tendered.replace(",", ".") || "0"));
  const changeOre = method === "kontant" ? Math.max(0, tenderedOre - totalOre) : 0;
  const cashShort = method === "kontant" && tenderedOre < totalOre;

  const finalize = async () => {
    if (!cashier?.shift_id || !cashier.id) {
      toast.error("Inget aktivt skift");
      return;
    }
    setBusy(true);
    try {
      // Card stub
      if (method === "kort") {
        const result = await stubPaymentTerminal.initiatePayment(totalOre, crypto.randomUUID());
        if (!result.ok) throw new Error(result.error || "Korttransaktion nekades");
      }

      // Get control code from kontrollenhet
      const { controlCode } = await stubCloudKontrollenhet.signTransaction({
        receiptNo: 0, // assigned by db
        totalOre,
        occurredAt: new Date().toISOString(),
        items: lines.map((l) => ({
          sku: l.sku,
          name: l.name,
          qty: l.quantity,
          lineTotalOre: l.line_total_ore,
          vatRate: l.vat_rate,
        })),
      });

      const vatBreakdownObj = Object.fromEntries(
        vatBreakdown.map((v) => [String(v.rate), { net: v.net, vat: v.vat, gross: v.gross }])
      );

      // Insert transaction
      const { data: tx, error: txError } = await (supabase as any)
        .from("pos_transactions")
        .insert({
          cashier_id: cashier.id,
          shift_id: cashier.shift_id,
          status: "completed",
          total_ore: totalOre,
          vat_breakdown: vatBreakdownObj,
          payment_method: method,
          payment_details:
            method === "kontant"
              ? { tendered_ore: tenderedOre, change_ore: changeOre }
              : null,
          control_code: controlCode,
        })
        .select("id, receipt_no, occurred_at")
        .single();

      if (txError) throw txError;

      // Insert items
      const itemsPayload = lines.map((l) => ({
        transaction_id: tx.id,
        product_id: l.product_id,
        product_name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_ore: l.unit_price_ore,
        line_total_ore: l.line_total_ore,
        discount_ore: l.discount_ore,
        vat_rate: l.vat_rate,
      }));
      const { error: itemsError } = await (supabase as any)
        .from("pos_transaction_items")
        .insert(itemsPayload);
      if (itemsError) throw itemsError;

      // Build receipt and clear cart
      setReceipt({
        receiptNo: tx.receipt_no,
        occurredAt: tx.occurred_at,
        cashierName: cashier.display_name,
        method,
        totalOre,
        tenderedOre: method === "kontant" ? tenderedOre : undefined,
        changeOre: method === "kontant" ? changeOre : undefined,
        controlCode,
        lines: lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unit: l.unit,
          unit_price_ore: l.unit_price_ore,
          line_total_ore: l.line_total_ore,
          vat_rate: l.vat_rate,
        })),
        vatBreakdown,
      });

      cartClear();
      toast.success(`Kvitto #${tx.receipt_no} skapat`);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte slutföra köp");
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kvitto #{receipt.receiptNo}</DialogTitle>
          </DialogHeader>
          <Receipt data={receipt} />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => window.print()}>
              Skriv ut
            </Button>
            <Button className="flex-1" onClick={onClose}>
              Klar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Betalning</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/60 p-4 flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Att betala</span>
          <span className="text-3xl font-semibold tabular text-primary">
            {formatSek(totalOre)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MethodButton active={method === "kontant"} onClick={() => setMethod("kontant")}>
            <Banknote className="h-5 w-5" /> Kontant
          </MethodButton>
          <MethodButton active={method === "kort"} onClick={() => setMethod("kort")}>
            <CreditCard className="h-5 w-5" /> Kort
          </MethodButton>
          <MethodButton active={method === "swish"} onClick={() => setMethod("swish")}>
            <Smartphone className="h-5 w-5" /> Swish
          </MethodButton>
        </div>

        {method === "kontant" && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="tendered">Mottaget belopp (SEK)</Label>
              <Input
                id="tendered"
                autoFocus
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="tabular text-2xl h-14"
                placeholder="0,00"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 200, 500, 1000].map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setTendered(String(v))}
                >
                  {v}
                </Button>
              ))}
            </div>
            <div
              className={`flex justify-between rounded-md p-3 ${
                cashShort ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
              }`}
            >
              <span className="text-sm font-medium">Växel</span>
              <span className="font-semibold tabular">{formatSek(changeOre)}</span>
            </div>
          </div>
        )}

        {method === "kort" && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Tryck "Slutför" för att starta kortterminalen (stub).
          </div>
        )}

        {method === "swish" && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            QR-kod genereras vid riktig integration. Stub: tryck Slutför.
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Avbryt
          </Button>
          <Button
            className="flex-1"
            onClick={finalize}
            disabled={busy || (method === "kontant" && cashShort)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Slutför"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MethodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 h-20 rounded-md border text-sm font-medium ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}
