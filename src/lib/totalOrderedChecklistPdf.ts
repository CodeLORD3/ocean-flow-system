import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface TotalChecklistRow {
  name: string;
  unit: string;
  total: number;
  /** Redan packad mängd, för kolumnen Kvar. */
  packed?: number;
  /** Butikens lagersaldo, om kolumnen är påslagen. */
  stock?: number | null;
  /** Utestående grossistorder, om kolumnen är påslagen. */
  onOrder?: number | null;
  /** Lager plus utestående grossistorder. */
  combined?: number | null;
  /** Lager minus kvar att packa. */
  sellable?: number | null;
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
  /** Vilka valfria kolumner som ska skrivas ut. */
  extraColumns?: { stock?: boolean; onOrder?: boolean; combined?: boolean; sellable?: boolean };
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

  if (payload.selectionNote) {
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(payload.selectionNote, margin, y - 2);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }



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

    const ex = payload.extraColumns ?? {};
    const extraHead: string[] = [];
    type ExtraKey = "stock" | "onOrder" | "combined" | "sellable";
    const extraKeys: ExtraKey[] = [];
    if (ex.stock) {
      extraHead.push("Lager");
      extraKeys.push("stock");
    }
    if (ex.onOrder) {
      extraHead.push("Order");
      extraKeys.push("onOrder");
    }
    if (ex.combined) {
      extraHead.push("Lager+Order");
      extraKeys.push("combined");
    }
    if (ex.sellable) {
      extraHead.push("Kan säljas");
      extraKeys.push("sellable");
    }
    const extraCell = (r: TotalChecklistRow, k: ExtraKey) => {
      const v = r[k];
      return v == null ? "–" : `${qty(v, r.unit)} ${r.unit}`;
    };

    const columnStyles: Record<number, any> = {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: "auto", fontStyle: "bold" },
      3: { cellWidth: 24, halign: "right", fontStyle: "bold" },
      4: { cellWidth: 22, halign: "right", textColor: [110, 110, 110] },
    };
    extraKeys.forEach((_, i) => {
      columnStyles[5 + i] = { cellWidth: 20, halign: "right", textColor: [110, 110, 110] };
    });
    columnStyles[5 + extraKeys.length] = { cellWidth: 15, halign: "right" };
    columnStyles[6 + extraKeys.length] = { cellWidth: 26, fontSize: 7, textColor: [110, 110, 110] };

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Sorterat", "Packat", "Produkt", "Mängd", "Kvar", ...extraHead, "Ordrar", "Leveranssätt"]],
      body: g.rows.map((r) => [
        "",
        "",
        r.name,
        `${qty(r.total, r.unit)} ${r.unit}`,
        `${qty(Math.max(r.total - Number(r.packed || 0), 0), r.unit)} ${r.unit}`,
        ...extraKeys.map((k) => extraCell(r, k)),
        String(r.orderCount),
        r.types,
      ]),
      styles: { fontSize: 11, cellPadding: 2.8, lineColor: [190, 190, 190], lineWidth: 0.25 },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontSize: 9,
        halign: "left",
      },
      columnStyles,


      // Rita kryssrutor i de två första kolumnerna
      didDrawCell: (data) => {
        if (data.section !== "body" || (data.column.index !== 0 && data.column.index !== 1)) return;
        const size = 5.6;
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
