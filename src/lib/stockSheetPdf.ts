import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface StockSheetPage {
  /** Lagerställets rubrik, t.ex. "Skaldjur-lager" */
  locationName: string;
  /** Butik/underrubrik, valfritt */
  storeName?: string | null;
  /** Antal tomma rader att fylla i */
  rows?: number;
}

const ROWS_DEFAULT = 20;

export function buildStockSheetDoc(pages: StockSheetPage[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;

  pages.forEach((page, idx) => {
    if (idx > 0) doc.addPage();

    // ── Topprad: DATUM / LAGERSTÄLLE / ANSVARIG ────────────────────────────
    const boxY = margin;
    const boxH = 13;
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, innerWidth, boxH, 1.5, 1.5);

    const baseY = boxY + 8.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("DATUM:", margin + 4, baseY);
    doc.setFont("helvetica", "normal");
    doc.text("____ / ____ / 20____", margin + 22, baseY);

    doc.setFont("helvetica", "bold");
    const labelX = margin + innerWidth * 0.33;
    doc.text("LAGERSTÄLLE / PLATS:", labelX, baseY);
    doc.setFont("helvetica", "normal");
    const nameX = labelX + 44;
    const nameLabel = page.storeName
      ? `${page.locationName} — ${page.storeName}`
      : page.locationName;
    const maxNameW = margin + innerWidth * 0.72 - nameX - 4;
    let nameSize = 10;
    while (nameSize > 6 && doc.getTextWidth(nameLabel) > maxNameW) {
      nameSize -= 0.5;
      doc.setFontSize(nameSize);
    }
    doc.text(nameLabel, nameX, baseY, { maxWidth: maxNameW });
    doc.setFontSize(10);

    doc.setFont("helvetica", "bold");
    const ansvX = margin + innerWidth * 0.72;
    doc.text("ANSVARIG:", ansvX, baseY);
    doc.setDrawColor(80);
    doc.line(ansvX + 20, baseY + 0.8, margin + innerWidth - 4, baseY + 0.8);

    // ── Tabell ─────────────────────────────────────────────────────────────
    const rowCount = page.rows ?? ROWS_DEFAULT;
    const body: string[][] = [];
    for (let i = 1; i <= rowCount; i++) {
      body.push([String(i), "", "", "", "", "", "", ""]);
    }
    body.push(["", "SUMMA (kg)", "0,0", "0,0", "0,0", "0,0", "", ""]);

    autoTable(doc, {
      startY: boxY + boxH + 5,
      head: [[
        "NR",
        "PRODUKTNAMN",
        "START\n(FRÅN LAGER)\nkg",
        "DATUM\n(FRÅN LAGER)",
        "PÅFYLLT\nUNDER DAGEN\nkg",
        "SLUT\n(VID STÄNGNING)\nkg",
        "SÅLT\nkg\n(Start + Påfyllt – Slut)",
        "KÄLLA VID STÄNGNING\n(PLACERAS TILLBAKA PÅ)",
      ]],
      body,
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 1.6,
        lineColor: [110, 110, 110],
        lineWidth: 0.2,
        textColor: [0, 0, 0],
        minCellHeight: 7,
        valign: "middle",
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
        minCellHeight: 16,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 68 },
        2: { cellWidth: 30, halign: "center" },
        3: { cellWidth: 30, halign: "center" },
        4: { cellWidth: 30, halign: "center" },
        5: { cellWidth: 30, halign: "center" },
        6: { cellWidth: 32, halign: "center" },
        7: { cellWidth: "auto", fillColor: [240, 246, 240] },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        const isSum = data.row.index === body.length - 1 && data.section === "body";
        if (isSum) {
          data.cell.styles.fillColor = [228, 228, 228];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.halign = data.column.index === 1 ? "center" : "center";
          if (data.column.index >= 2 && data.column.index <= 5) {
            data.cell.styles.textColor = [20, 50, 130];
          }
          if (data.column.index === 7) data.cell.styles.fillColor = [240, 246, 240];
        }
      },
    });

    // ── Noteringar ─────────────────────────────────────────────────────────
    let y = ((doc as any).lastAutoTable?.finalY || boxY + boxH + 5) + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("NOTERINGAR / KOMMENTARER:", margin, y);
    doc.setDrawColor(160);
    doc.line(margin + 52, y + 0.8, pageWidth - margin, y + 0.8);
    for (let i = 0; i < 3; i++) {
      y += 5;
      if (y > pageHeight - margin) break;
      doc.line(margin, y + 0.8, pageWidth - margin, y + 0.8);
    }
  });

  return doc;
}

export function generateStockSheetPdf(pages: StockSheetPage[], fileName?: string) {
  const doc = buildStockSheetDoc(pages);
  doc.save(fileName || `Lagerlistor-${new Date().toISOString().slice(0, 10)}.pdf`);
}
