import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { displayOrderWeek } from "@/lib/orderWeek";

export type OrderDocumentKind = "packing" | "delivery";
const nf = (value: unknown, decimals = 1) => Number(value ?? 0).toLocaleString("sv-SE", { maximumFractionDigits: decimals });

/** Data-based layout keeps long product names and notes intact across pages. */
export function buildOrderDocumentPdf(order: any, kind: OrderDocumentKind) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const delivery = kind === "delivery";
  const lines: any[] = order.shop_order_lines ?? [];
  const store = order.stores ?? {};
  let y = 18;
  const text = (value: string, bold = false, size = 10) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const row of doc.splitTextToSize(value, 178) as string[]) {
      if (y > 274) { doc.addPage(); y = 18; }
      doc.text(row, 16, y);
      y += size * 0.45 + 1;
    }
  };
  text(delivery ? "Följesedel / Delivery Note" : "Grossist Packsedel / Packing Slip", true, 16);
  y += 3;
  text(store.name || "—", true, 12);
  for (const value of [store.address, store.city, store.phone]) if (value) text(String(value));
  text(`Order: ${displayOrderWeek(order)} · Nr: ${order.id?.slice(0, 8).toUpperCase() || "—"}`);
  text(`Leveransdatum: ${order.desired_delivery_date || "—"} · Orderdatum: ${order.created_at ? new Date(order.created_at).toLocaleDateString("sv-SE") : "—"}`);
  if (delivery) text(`Packad av: ${order.packer_name || "—"}`);
  if (order.notes) { y += 3; text("Anteckning från butiken / Notes", true); text(String(order.notes)); }
  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: 16, right: 16, top: 18, bottom: 18 },
    head: [["Produkt / Product", "Kategori", "HS-kod", "Beställt", "Packat", "Enhet", ...(delivery ? ["Pris/enhet", "Radvärde"] : [])]],
    body: lines.map((line) => {
      const packed = Number(line.quantity_delivered ?? 0);
      const price = Number(line.products?.wholesale_price ?? 0);
      return [
        `${line.products?.name || "—"}${line.priority_note ? `\nAnteckning: ${line.priority_note}` : ""}`,
        line.products?.category || "—", line.products?.hs_code || "", nf(line.quantity_ordered),
        line.quantity_delivered == null || (!delivery && packed === 0) ? "" : nf(packed),
        line.unit || line.products?.unit || "kg", ...(delivery ? [nf(price, 2), nf(packed * price, 2)] : []),
      ];
    }),
    styles: { font: "helvetica", fontSize: delivery ? 8 : 9, cellPadding: 2, overflow: "linebreak" },
    rowPageBreak: "avoid",
    columnStyles: { 0: { cellWidth: delivery ? 43 : 58 }, 3: { halign: "right" }, 4: { halign: "right" } },
    didDrawPage: ({ cursor }) => { if (cursor) y = cursor.y; },
  });
  y += 8;
  text(`Antal rader: ${lines.length}`);
  if (delivery) {
    const value = lines.reduce((sum, line) => sum + Number(line.quantity_delivered ?? 0) * Number(line.products?.wholesale_price ?? 0), 0);
    text(`Totalt ordervärde (kr): ${nf(value, 2)}`, true);
  }
  text("Antal kollin / Boxes: __________    Antal pallar / Pallets: __________");
  y += 6;
  text("Packad av: __________    Chaufför: __________    Mottagen av: __________");
  return doc;
}

export async function downloadOrderDocument(order: any, kind: OrderDocumentKind) {
  const blob = buildOrderDocumentPdf(order, kind).output("blob");
  const name = String(order.stores?.name || "order").replace(/[^\p{L}\p{N}._-]+/gu, "-");
  const filename = `${kind === "delivery" ? "foljesedel" : "packsedel"}-${name}-${order.id?.slice(0, 8) || displayOrderWeek(order)}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (error) { if ((error as DOMException).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
