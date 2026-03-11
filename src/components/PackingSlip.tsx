import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Printer } from "lucide-react";

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
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #111; font-size: 11px; }
            @media print {
              body { padding: 0; }
              @page { margin: 12mm; size: A4; }
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const totalOrderedWeight = lines.reduce((sum: number, l: any) => {
    const qty = l.quantity_ordered || 0;
    const weight = l.products?.weight_per_piece || 0;
    return sum + qty * weight;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-sm font-heading flex items-center gap-2">
            <Printer className="h-4 w-4" /> Packsedel — {storeName}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2">
          <div ref={printRef}>
            {/* === PRINTED CONTENT START === */}
            <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 11, color: "#111", display: "flex", flexDirection: "column", minHeight: "1100px" }}>

              {/* Header */}
              <div style={{ textAlign: "center", borderBottom: "3px solid #111", paddingBottom: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                  Grossist Packsedel
                </div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>Wholesale Packing Slip</div>
              </div>

              {/* Info grid — 2 columns */}
              <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {([
                        ["Kund / Customer", storeName],
                        ["Adress / Address", ""],
                        ["Leveransadress", ""],
                        ["Telefon / Phone", ""],
                        ["Kundnr / Customer No.", ""],
                      ] as [string, string][]).map(([label, value]) => (
                        <tr key={label}>
                          <td style={{ padding: "3px 6px 3px 0", fontWeight: 600, fontSize: 10, color: "#444", whiteSpace: "nowrap", width: 140 }}>{label}</td>
                          <td style={{ padding: "3px 0", borderBottom: "1px solid #ccc", fontSize: 11 }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ flex: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {([
                        ["Packsedel nr", order.id?.slice(0, 8).toUpperCase()],
                        ["Order nr / Order No.", order.order_week],
                        ["Leveransdatum", deliveryDate],
                        ["Orderdatum", orderDate],
                        ["Antal rader", String(lines.length)],
                      ] as [string, string][]).map(([label, value]) => (
                        <tr key={label}>
                          <td style={{ padding: "3px 6px 3px 0", fontWeight: 600, fontSize: 10, color: "#444", whiteSpace: "nowrap", width: 140 }}>{label}</td>
                          <td style={{ padding: "3px 0", borderBottom: "1px solid #ccc", fontSize: 11 }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Product table — flex-grow to fill A4 space */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                  <thead>
                    <tr style={{ background: "#222", color: "#fff" }}>
                      {["✓", "Produkt / Product", "Kategori", "HS-kod", "Beställt", "Packat", "Enhet"].map((h, i) => (
                        <th key={h} style={{
                          padding: "6px 5px",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          textAlign: i === 0 ? "center" : i >= 4 ? "center" : "left",
                          borderRight: i < 6 ? "1px solid #444" : "none",
                          width: i === 0 ? 28 : undefined,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line: any, idx: number) => (
                      <tr key={line.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f7f7f7" }}>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", textAlign: "center", width: 28 }}>
                          <div style={{ width: 12, height: 12, border: "1.5px solid #555", borderRadius: 2, margin: "0 auto" }}></div>
                        </td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", fontSize: 13, fontWeight: 500 }}>
                          {line.products?.name || "—"}
                        </td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", fontSize: 12, color: "#555" }}>
                          {line.products?.category || "—"}
                        </td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", fontSize: 12, color: "#555" }}>
                          {line.products?.hs_code || ""}
                        </td>
                        <td style={{ padding: 0, borderBottom: "1px solid #ddd", textAlign: "center", border: "2px solid #333", fontVariantNumeric: "tabular-nums", fontSize: 13, minWidth: 40 }}>
                          {line.quantity_ordered}
                        </td>
                        <td style={{ padding: 0, borderBottom: "1px solid #ddd", textAlign: "center", border: "2px solid #333", fontSize: 13, minWidth: 40, minHeight: 22 }}>
                          &nbsp;
                        </td>
                        <td style={{ padding: 0, borderBottom: "1px solid #ddd", textAlign: "center", border: "2px solid #333", fontSize: 10, minWidth: 36 }}>
                          {line.unit || line.products?.unit || "kg"}
                        </td>
                      </tr>
                    ))}
                    {/* Empty rows to fill A4 space */}
                    {Array.from({ length: Math.max(0, 20 - lines.length) }).map((_, i) => (
                      <tr key={`empty-${i}`} style={{ background: (lines.length + i) % 2 === 0 ? "#fff" : "#f7f7f7" }}>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", width: 28, height: 24 }}></td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd", height: 24 }}>&nbsp;</td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd" }}></td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd" }}></td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd" }}></td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd" }}></td>
                        <td style={{ padding: "5px", borderBottom: "1px solid #ddd" }}></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <table style={{ borderCollapse: "collapse", minWidth: 260 }}>
                  <tbody>
                    {([
                      ["Total beställd vikt (kg)", totalOrderedWeight > 0 ? totalOrderedWeight.toFixed(2) : "—"],
                      ["Total packad vikt (kg)", ""],
                      ["Antal kollin / Boxes", ""],
                      ["Antal pallar / Pallets", ""],
                    ] as [string, string][]).map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: "3px 10px 3px 0", fontWeight: 600, fontSize: 10, color: "#444" }}>{label}</td>
                        <td style={{ padding: "3px 0", borderBottom: "1px solid #ccc", fontSize: 11, minWidth: 80, textAlign: "right" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              {order.notes && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", color: "#444", marginBottom: 4 }}>Anteckning / Notes</div>
                  <div style={{ border: "1px solid #ccc", borderRadius: 3, padding: 8, fontSize: 11, minHeight: 30 }}>{order.notes}</div>
                </div>
              )}

              {/* Signatures */}
              <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
                {["Packad av / Packed By", "Chaufför / Driver", "Mottagen av / Received By"].map((label) => (
                  <div key={label} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ borderBottom: "1px solid #999", height: 36, marginBottom: 4 }}></div>
                    <div style={{ fontSize: 9, color: "#666", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ marginTop: 20, borderTop: "1px solid #ccc", paddingTop: 8, fontSize: 9, color: "#999", display: "flex", justifyContent: "space-between" }}>
                <span>Utskriven: {new Date().toLocaleDateString("sv-SE")} {new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>Order-ID: {order.id?.slice(0, 8)}</span>
              </div>
            </div>
            {/* === PRINTED CONTENT END === */}
          </div>
        </div>

        <DialogFooter className="px-6 pb-5">
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
