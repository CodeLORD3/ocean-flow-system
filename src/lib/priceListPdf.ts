import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface PriceListPdfRow {
  category: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
}

export function generatePriceListPdf(
  storeName: string | null,
  rows: PriceListPdfRow[],
  opts: { dateStr?: string; listName?: string } = {},
) {
  const dateStr = opts.dateStr || format(new Date(), "yyyy-MM-dd");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.listName || "Prislista", 40, 50);

  let cursorY = 68;
  if (storeName) {
    doc.setFontSize(13);
    doc.setTextColor(60);
    doc.text(storeName, 40, 70);
    cursorY = 88;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Datum: ${dateStr}`, 40, cursorY);
  doc.text(`${rows.length} produkter`, pageWidth - 40, cursorY, { align: "right" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: cursorY + 16,
    head: [["Kategori", "Produkt", "SKU", "Enhet", "Pris (SEK)"]],
    body: rows.map((r) => [
      r.category,
      r.name,
      r.sku,
      r.unit,
      Number(r.price).toFixed(2).replace(".", ",") + " kr",
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 80 },
      3: { cellWidth: 50, halign: "center" },
      4: { cellWidth: 80, halign: "right" },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Sida ${current} / ${pageCount}`, pageWidth - 40, pageHeight - 20, { align: "right" });
      if (storeName) {
        doc.text(storeName, 40, pageHeight - 20);
      }
      doc.setTextColor(0);
    },
  });

  const safeName = storeName ? storeName.replace(/[^a-z0-9-_]+/gi, "_") : "alla";
  doc.save(`prislista-${safeName}-${dateStr}.pdf`);
}
