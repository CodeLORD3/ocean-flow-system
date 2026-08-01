import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface StockSheetItem {
  name: string;
  /** Nuvarande saldo (kg eller st) */
  quantity?: number | null;
  unit?: string | null;
}

export interface StockSheetPage {
  /** Lagerställets rubrik, t.ex. "Skaldjur-lager" */
  locationName: string;
  /** Butik/underrubrik, valfritt */
  storeName?: string | null;
  /** Antal tomma rader att fylla i */
  rows?: number;
  /** Förifyllda produkter med befintligt saldo */
  items?: StockSheetItem[];
  /** Källkedja, t.ex. ["Makrilltrade", "Amhult Shop", "Försäljningslager"] */
  sourceParts?: string[];
}

const ROWS_DEFAULT = 18;

const fmtQty = (q?: number | null) =>
  q === null || q === undefined || Number.isNaN(Number(q))
    ? ""
    : Number(q).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });


export function buildStockSheetDoc(pages: StockSheetPage[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;

  pages.forEach((page, idx) => {
    if (idx > 0) doc.addPage();

    // ── Stor centrerad rubrik ──────────────────────────────────────────────
    const bigTitle = page.locationName.toUpperCase();
    doc.setFont("helvetica", "bold");
    let titleSize = 26;
    doc.setFontSize(titleSize);
    while (titleSize > 12 && doc.getTextWidth(bigTitle) > innerWidth - 10) {
      titleSize -= 1;
      doc.setFontSize(titleSize);
    }
    doc.setTextColor(0);
    doc.text(bigTitle, pageWidth / 2, margin + 8, { align: "center" });
    if (page.storeName) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(70);
      doc.text(page.storeName, pageWidth / 2, margin + 14.5, { align: "center" });
    }
    doc.setTextColor(0);

    // ── Topprad: DATUM / LAGERSTÄLLE / ANSVARIG ────────────────────────────
    const boxY = margin + (page.storeName ? 19 : 13);
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
    const items = page.items ?? [];
    const rowCount = Math.max(page.rows ?? ROWS_DEFAULT, items.length + 4);
    const body: string[][] = [];
    for (let i = 1; i <= rowCount; i++) {
      const it = items[i - 1];
      body.push([
        String(i),
        it ? it.name : "",
        it ? fmtQty(it.quantity) : "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }
    const startSum = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    body.push(["", "SUMMA (kg)", items.length ? fmtQty(startSum) : "0,0", "", "0,0", "0,0", "0,0", ""]);


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
        minCellHeight: 6,
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
      if (y > pageHeight - margin - 8) break;
      doc.line(margin, y + 0.8, pageWidth - margin, y + 0.8);
    }

    // ── Fotnot: Källa ──────────────────────────────────────────────────────
    const footY = pageHeight - margin + 2;
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.line(margin, footY - 5, pageWidth - margin, footY - 5);
    const parts =
      page.sourceParts && page.sourceParts.length > 0
        ? page.sourceParts
        : [page.storeName, page.locationName].filter(Boolean) as string[];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text("Källa:", margin, footY);
    doc.setFont("helvetica", "normal");
    doc.text(parts.join(" › "), margin + 10, footY, {
      maxWidth: innerWidth * 0.6,
    });
    doc.text(
      `Utskriven: ${new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}  ·  Sida ${idx + 1}/${pages.length}`,
      pageWidth - margin,
      footY,
      { align: "right" },
    );
    doc.setTextColor(0);
  });

  return doc;
}

export function generateStockSheetPdf(pages: StockSheetPage[], fileName?: string) {
  const doc = buildStockSheetDoc(pages);
  doc.save(fileName || `Lagerlistor-${new Date().toISOString().slice(0, 10)}.pdf`);
}
