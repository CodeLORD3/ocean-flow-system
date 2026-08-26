import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface TotalChecklistRow {
  name: string;
  unit: string;
  total: number;
  orderCount: number;
  types: string;
}

export interface TotalChecklistGroup {
  label: string;
  orderCount: number;
  rows: TotalChecklistRow[];
}

export interface TotalChecklistPayload {
  title?: string;
  periodLabel: string;
  storeName?: string;
  /** Extra rad i sidhuvudet, t.ex. när bara vissa varor är valda. */
  selectionNote?: string;
  groups: TotalChecklistGroup[];
}


const qty = (v: number, unit: string) =>
  Number(v || 0).toLocaleString("sv-SE", {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: unit === "kg" ? 1 : 0,
  });

/**
 * Utskrivbar checklista för "Totalt beställt" — en rad per produkt med
 * kryssruta för sortering och packning.
 */
export function generateTotalOrderedChecklistPdf(payload: TotalChecklistPayload) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(payload.title || "Totalt beställt – sorterings- och packlista", margin, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(payload.periodLabel, margin, 16);
  if (payload.storeName) {
    doc.text(payload.storeName, pageWidth - margin, 10, { align: "right" });
  }
  doc.text(
    `Utskriven: ${new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`,
    pageWidth - margin,
    16,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);

  let y = 30;

  for (const g of payload.groups) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${g.label}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(`${g.orderCount} ordrar`, pageWidth - margin, y, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 3;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Sorterat", "Packat", "Produkt", "Mängd", "Enhet", "Ordrar", "Leveranssätt"]],
      body: g.rows.map((r) => [
        "",
        "",
        r.name,
        qty(r.total, r.unit),
        r.unit,
        String(r.orderCount),
        r.types,
      ]),
      styles: { fontSize: 9, cellPadding: 2, lineColor: [210, 210, 210], lineWidth: 0.2 },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontSize: 8,
        halign: "left",
      },
      columnStyles: {
        0: { cellWidth: 16, halign: "center" },
        1: { cellWidth: 16, halign: "center" },
        2: { cellWidth: "auto", fontStyle: "bold" },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 12 },
        5: { cellWidth: 14, halign: "right" },
        6: { cellWidth: 42, fontSize: 7, textColor: [110, 110, 110] },
      },
      // Rita kryssrutor i de två första kolumnerna
      didDrawCell: (data) => {
        if (data.section !== "body" || (data.column.index !== 0 && data.column.index !== 1)) return;
        const size = 4.2;
        const cx = data.cell.x + data.cell.width / 2 - size / 2;
        const cy = data.cell.y + data.cell.height / 2 - size / 2;
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.3);
        doc.rect(cx, cy, size, size);
      },
    });

    // @ts-expect-error jspdf-autotable utökar doc med lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  // Signaturrad
  if (y > 265) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y + 8, margin + 60, y + 8);
  doc.line(pageWidth - margin - 60, y + 8, pageWidth - margin, y + 8);
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text("Sorterat av", margin, y + 12);
  doc.text("Packat av", pageWidth - margin - 60, y + 12);

  doc.save(`totallista-checklista-${new Date().toISOString().slice(0, 10)}.pdf`);
}
