import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ChecklistPdfItem {
  section: string;
  time_label?: string | null;
  category?: string | null;
  task: string;
  done?: boolean;
  signature?: string | null;
  note?: string | null;
}

export interface ChecklistPdfOptions {
  storeName?: string | null;
  date: string;
  weekday: string;
  shift?: string | null;
  responsible?: string | null;
  status?: string | null;
  items: ChecklistPdfItem[];
  /** true = tom lista att fylla i för hand (inga kryss/signaturer/kommentarer) */
  blank?: boolean;
  /** Kommentar per sida — nyckel = sidnummer (1-baserat). Skrivs längst ner på respektive sida. */
  pageComments?: Record<string, string> | null;
}

/** Byter ut tecken som helvetica i jsPDF inte klarar. */
const s2 = (v?: string | null) => (v ?? "").replace(/\u2013|\u2014/g, "-").trim();

export function buildChecklistDoc(opts: ChecklistPdfOptions) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerWidth = pageWidth - margin * 2;

  // ── Rubrik ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.text("DAGLIG CHECKLISTA", pageWidth / 2, margin + 7, { align: "center" });

  if (opts.storeName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(70);
    doc.text(s2(opts.storeName), pageWidth / 2, margin + 13.5, { align: "center" });
  }
  doc.setTextColor(0);

  // ── Metaruta ──────────────────────────────────────────────────────────────
  const boxY = margin + (opts.storeName ? 18 : 12);
  const boxH = 13;
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, boxY, innerWidth, boxH, 1.5, 1.5);

  const baseY = boxY + 8.5;
  const col = innerWidth / 4;
  const meta: [string, string][] = [
    ["DATUM:", opts.blank ? "____ / ____ / 20____" : s2(opts.date)],
    ["VECKODAG:", opts.blank ? "" : s2(opts.weekday)],
    ["PASS:", s2(opts.shift) || (opts.blank ? "" : "-")],
    ["ANSVARIG:", opts.blank ? "" : s2(opts.responsible) || "-"],
  ];
  meta.forEach(([label, value], i) => {
    const x = margin + 4 + col * i;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(label, x, baseY - 3.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    if (value) {
      doc.text(value, x, baseY + 2.2, { maxWidth: col - 6 });
    } else {
      doc.setDrawColor(150);
      doc.line(x, baseY + 2.8, x + col - 8, baseY + 2.8);
    }
  });

  // ── Tabell ────────────────────────────────────────────────────────────────
  type Row = { section?: string; item?: ChecklistPdfItem };
  const rows: Row[] = [];
  let lastSection: string | null = null;
  opts.items.forEach((item) => {
    const sec = s2(item.section) || "Övrigt";
    if (sec !== lastSection) {
      rows.push({ section: sec });
      lastSection = sec;
    }
    rows.push({ item });
  });

  const ROW_H = 9.5;
  const SECTION_H = 8;

  const body: any[][] = rows.map((r) => {
    if (r.section) {
      return [
        {
          content: r.section.toUpperCase(),
          colSpan: 6,
          styles: {
            fillColor: [38, 50, 62] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: "bold" as const,
            fontSize: 8,
            halign: "left" as const,
            valign: "middle" as const,
            minCellHeight: SECTION_H,
          },
        },
      ];
    }
    const it = r.item!;
    return [
      s2(it.time_label),
      s2(it.category),
      s2(it.task),
      opts.blank ? "" : it.done ? "X" : "",
      opts.blank ? "" : s2(it.note),
      opts.blank ? "" : s2(it.signature),
    ];
  });

  autoTable(doc, {
    startY: boxY + boxH + 6,
    head: [["TID", "KATEGORI", "UPPGIFT", "KLAR", "KOMMENTAR / AVVIKELSE", "SIGN"]],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2.4, right: 2.4 },
      lineColor: [205, 210, 214],
      lineWidth: 0.15,
      textColor: [25, 30, 35],
      minCellHeight: ROW_H,
      valign: "middle",
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: [38, 50, 62],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.8,
      halign: "center",
      valign: "middle",
      minCellHeight: 9,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
      lineColor: [38, 50, 62],
      lineWidth: 0.15,
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 14, halign: "center", textColor: [90, 96, 102] },
      1: { cellWidth: 26, textColor: [90, 96, 102] },
      2: { cellWidth: "auto", fontStyle: "bold" },
      3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 44 },
      5: { cellWidth: 16, halign: "center" },
    },
    margin: { left: margin, right: margin, bottom: margin + 30 },
    didParseCell: (data) => {
      if (data.section === "head" && [1, 2, 4].includes(data.column.index)) {
        data.cell.styles.halign = "left";
      }
      const isSection = data.row.raw && (data.row.raw as any[]).length === 1;
      if (data.section === "body" && isSection) {
        // sektionsrad hanteras av egna styles ovan
        if (data.column.index === 0) data.cell.styles.cellPadding = { top: 1.8, bottom: 1.8, left: 2.4, right: 2.4 };
        return;
      }
      if (data.section === "body") {
        // exakt samma radhöjd över hela listan
        data.cell.styles.minCellHeight = ROW_H;
        if (data.column.index === 3) data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      // rita kryssruta i KLAR-kolumnen
      const isSection = data.row.raw && (data.row.raw as any[]).length === 1;
      if (data.section !== "body" || isSection || data.column.index !== 3) return;
      const size = 3.6;
      const x = data.cell.x + data.cell.width / 2 - size / 2;
      const y = data.cell.y + data.cell.height / 2 - size / 2;
      const checked = !opts.blank && String(data.cell.raw ?? "") === "X";
      doc.setDrawColor(120, 128, 134);
      doc.setLineWidth(0.25);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, size, size, 0.5, 0.5, "FD");
      if (checked) {
        doc.setDrawColor(20, 120, 70);
        doc.setLineWidth(0.6);
        doc.line(x + 0.7, y + size / 2, x + size / 2 - 0.15, y + size - 0.8);
        doc.line(x + size / 2 - 0.15, y + size - 0.8, x + size - 0.6, y + 0.7);
      }
    },
  });

  // ── Signaturfält ──────────────────────────────────────────────────────────
  let y = ((doc as any).lastAutoTable?.finalY || boxY + boxH + 5) + 10;
  if (y > pageHeight - margin - 26) {
    doc.addPage();
    y = margin + 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("NOTERINGAR:", margin, y);
  doc.setDrawColor(160);
  doc.setLineWidth(0.2);
  doc.line(margin + 24, y + 0.8, pageWidth - margin, y + 0.8);
  doc.line(margin, y + 6, pageWidth - margin, y + 6);
  doc.line(margin, y + 12, pageWidth - margin, y + 12);

  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("KONTROLLERAD AV:", margin, y);
  doc.line(margin + 34, y + 0.8, margin + innerWidth * 0.55, y + 0.8);
  doc.text("DATUM:", margin + innerWidth * 0.62, y);
  doc.line(margin + innerWidth * 0.62 + 16, y + 0.8, pageWidth - margin, y + 0.8);

  // ── Fotnot på alla sidor ──────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const footY = pageHeight - margin + 4;

    // Sidkommentar längst ner på sidan
    const comment = opts.blank ? "" : s2(opts.pageComments?.[String(p)]);
    const cTop = footY - 22;
    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(`KOMMENTAR SIDA ${p}:`, margin, cTop);
    if (comment) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(25, 30, 35);
      const lines = doc.splitTextToSize(comment, innerWidth - 2).slice(0, 3);
      lines.forEach((ln: string, li: number) => doc.text(ln, margin, cTop + 5 + li * 4.4));
    } else {
      doc.setDrawColor(180);
      doc.line(margin, cTop + 5.5, pageWidth - margin, cTop + 5.5);
      doc.line(margin, cTop + 11.5, pageWidth - margin, cTop + 11.5);
    }
    doc.setTextColor(0);

    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.line(margin, footY - 5, pageWidth - margin, footY - 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    const left = [s2(opts.storeName), s2(opts.date), s2(opts.weekday), opts.status === "completed" ? "Slutford" : "Pagaende"]
      .filter(Boolean)
      .join("  -  ");
    doc.text(left, margin, footY, { maxWidth: innerWidth * 0.65 });
    doc.text(
      `Utskriven: ${new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}  -  Sida ${p}/${total}`,
      pageWidth - margin,
      footY,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  return doc;
}

export function generateChecklistPdf(opts: ChecklistPdfOptions, fileName?: string) {
  const doc = buildChecklistDoc(opts);
  const store = (opts.storeName || "Checklista").replace(/[^\w\-åäöÅÄÖ ]/g, "").trim();
  doc.save(fileName || `Checklista-${store}-${opts.date}${opts.blank ? "-tom" : ""}.pdf`);
}
