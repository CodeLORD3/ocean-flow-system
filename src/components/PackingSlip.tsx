import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Printer, Download } from "lucide-react";

interface PackingSlipProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PackingSlip({ order, open, onOpenChange }: PackingSlipProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const lines = order.shop_order_lines || [];
  const storeName = order.stores?.name || "—";
  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("sv-SE")
    : "—";
  const deliveryDate = order.desired_delivery_date || "—";

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Packsedel — ${storeName} — ${order.order_week}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; }
            .title { font-size: 22px; font-weight: 700; }
            .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
            .meta { text-align: right; font-size: 12px; line-height: 1.6; }
            .meta strong { display: inline-block; min-width: 100px; text-align: left; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #666; border-bottom: 1px solid #ccc; padding: 8px 6px; }
            th.right { text-align: right; }
            td { font-size: 13px; padding: 8px 6px; border-bottom: 1px solid #eee; }
            td.right { text-align: right; font-variant-numeric: tabular-nums; }
            .category-row td { font-size: 11px; font-weight: 700; color: #666; background: #f5f5f5; padding-top: 12px; }
            .check-col { width: 40px; text-align: center; }
            .check-box { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #999; border-radius: 2px; }
            .footer { margin-top: 32px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 11px; color: #999; display: flex; justify-content: space-between; }
            .notes { margin-top: 24px; font-size: 12px; }
            .notes-label { font-weight: 600; font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
            .notes-box { border: 1px solid #ccc; border-radius: 4px; min-height: 60px; padding: 8px; }
            @media print {
              body { padding: 0; }
              @page { margin: 15mm; }
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Group lines by category
  const grouped = lines.reduce((acc: Record<string, any[]>, line: any) => {
    const cat = line.products?.category || "Övrigt";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(line);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedCategories = Object.keys(grouped).sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-heading flex items-center gap-2">
            <Printer className="h-4 w-4" /> Packsedel — {storeName}
          </DialogTitle>
        </DialogHeader>

        {/* Printable content (hidden visually in dialog, used for print) */}
        <div ref={printRef}>
          <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "2px solid #111", paddingBottom: 16 }}>
            <div>
              <div className="title" style={{ fontSize: 22, fontWeight: 700 }}>PACKSEDEL</div>
              <div className="subtitle" style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Order {order.order_week}</div>
            </div>
            <div className="meta" style={{ textAlign: "right", fontSize: 12, lineHeight: 1.6 }}>
              <div><strong>Butik:</strong> {storeName}</div>
              <div><strong>Orderdatum:</strong> {orderDate}</div>
              <div><strong>Önskad leverans:</strong> {deliveryDate}</div>
              <div><strong>Antal rader:</strong> {lines.length}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#666", borderBottom: "1px solid #ccc", padding: "8px 6px" }}>Produkt</th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#666", borderBottom: "1px solid #ccc", padding: "8px 6px" }}>Antal</th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#666", borderBottom: "1px solid #ccc", padding: "8px 6px" }}>Enhet</th>
                <th style={{ textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#666", borderBottom: "1px solid #ccc", padding: "8px 6px", width: 40 }}>✓</th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map((cat) => (
                <>
                  <tr key={`cat-${cat}`}>
                    <td colSpan={4} style={{ fontSize: 11, fontWeight: 700, color: "#666", background: "#f5f5f5", paddingTop: 12, padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                      ▸ {cat}
                    </td>
                  </tr>
                  {grouped[cat].map((line: any) => (
                    <tr key={line.id}>
                      <td style={{ fontSize: 13, padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                        {line.products?.name || "—"}
                      </td>
                      <td style={{ fontSize: 13, padding: "8px 6px", borderBottom: "1px solid #eee", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {line.quantity_ordered}
                      </td>
                      <td style={{ fontSize: 13, padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                        {line.unit || line.products?.unit || "kg"}
                      </td>
                      <td style={{ fontSize: 13, padding: "8px 6px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                        <span style={{ display: "inline-block", width: 16, height: 16, border: "1.5px solid #999", borderRadius: 2 }} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", color: "#666", marginBottom: 4 }}>Anteckning</div>
              <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: 8, fontSize: 12 }}>{order.notes}</div>
            </div>
          )}

          <div style={{ marginTop: 32, borderTop: "1px solid #ccc", paddingTop: 12, fontSize: 11, color: "#999", display: "flex", justifyContent: "space-between" }}>
            <span>Utskriven: {new Date().toLocaleDateString("sv-SE")} {new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>Order-ID: {order.id.slice(0, 8)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Stäng
          </Button>
          <Button size="sm" onClick={handlePrint} className="text-xs gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Skriv ut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
