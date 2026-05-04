import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PurchaseListItem {
  productName: string;
  category: string;
  quantity: number;
  unit: string;
  shops: { name: string; quantity: number }[];
  departureDate?: string; // formatted, e.g. "Mån 5/5"
  departureTime?: string;
}

export interface PurchaseListPdfPayload {
  title?: string;
  week: number;
  year: number;
  weekRange: string;
  purchaserName?: string;
  notes?: string;
  items: PurchaseListItem[];
}

const fmtNum = (v: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(v || 0);

export function generatePurchaseListPdf(payload: PurchaseListPdfPayload) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // Header band
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(payload.title || "Inköpslista", margin, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Vecka ${payload.week}, ${payload.year}  ·  ${payload.weekRange}`,
    margin,
    16,
  );
  if (payload.purchaserName) {
    doc.text(`Inköpare: ${payload.purchaserName}`, pageWidth - margin, 10, { align: "right" });
  }
  doc.text(
    `Utskriven: ${new Date().toLocaleDateString("sv-SE")}`,
    pageWidth - margin,
    16,
    { align: "right" },
  );

  doc.setTextColor(0, 0, 0);

  // Group items by category
  const byCat = new Map<string, PurchaseListItem[]>();
  for (const it of payload.items) {
    const arr = byCat.get(it.category) || [];
    arr.push(it);
    byCat.set(it.category, arr);
  }

  let cursorY = 28;

  const totalQty = payload.items.reduce((s, i) => s + (i.quantity || 0), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `${payload.items.length} produkter  ·  Total mängd: ${fmtNum(totalQty)}`,
    margin,
    cursorY,
  );
  cursorY += 4;

  for (const [category, items] of Array.from(byCat.entries()).sort()) {
    const rows = items.map((it) => [
      "☐",
      it.productName,
      `${fmtNum(it.quantity)} ${it.unit}`,
      it.shops.length > 0
        ? it.shops.map((s) => `${s.name} (${fmtNum(s.quantity)})`).join(", ")
        : "—",
      it.departureDate
        ? `${it.departureDate}${it.departureTime ? " " + it.departureTime : ""}`
        : "—",
      "",
    ]);

    autoTable(doc, {
      startY: cursorY + 2,
      head: [[
        "",
        category.toUpperCase(),
        "Mängd",
        "Butiker",
        "Avgång",
        "Anteckning",
      ]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 1.8, lineColor: [220, 220, 220] },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontStyle: "bold",
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 7, halign: "center" },
        1: { cellWidth: 55 },
        2: { cellWidth: 24, halign: "right" },
        3: { cellWidth: 50 },
        4: { cellWidth: 22 },
        5: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });

    // @ts-ignore
    cursorY = (doc as any).lastAutoTable.finalY + 2;
  }

  if (payload.notes) {
    cursorY += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Anteckningar", margin, cursorY);
    cursorY += 4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(payload.notes, pageWidth - margin * 2);
    doc.text(lines, margin, cursorY);
  }

  // Footer with signature line
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const ph = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, ph - 16, pageWidth - margin, ph - 16);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Signatur inköpare: ____________________", margin, ph - 10);
    doc.text("Datum: __________", pageWidth / 2, ph - 10);
    doc.text(`Sida ${p}/${pageCount}`, pageWidth - margin, ph - 10, { align: "right" });
  }

  const fileName = `Inkopslista_v${payload.week}_${payload.year}.pdf`;
  doc.save(fileName);
}
