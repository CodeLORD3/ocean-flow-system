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
}

/** Byter ut tecken som helvetica i jsPDF inte klarar. */
const s = (v?: string | null) => (v ?? "").replace(/\u2013|\u2014/g, "-").trim();

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
    doc.text(s(opts.storeName), pageWidth / 2, margin + 13.5, { align: "center" });
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
    ["DATUM:", opts.blank ? "____ / ____ / 20____" : s(opts.date)],
    ["VECKODAG:", opts.blank ? "" : s(opts.weekday)],
    ["PASS:", s(opts.shift) || (opts.blank ? "" : "-")],
    ["ANSVARIG:", opts.blank ? "" : s(opts.responsible) || "-"],
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
    const sec = s(item.section) || "Övrigt";
    if (sec !== lastSection) {
      rows.push({ section: sec });
      lastSection = sec;
    }
    rows.push({ item });
  });

  const sectionRowIndexes = new Set<number>();
  const body: string[][] = rows.map((r, idx) => {
    if (r.section) {
      sectionRowIndexes.add(idx);
      return [r.section.toUpperCase(), "", "", "", "", ""];
    }
    const it = r.item!;
    return [
      s(it.time_label),
      s(it.category),
      s(it.task),
      opts.blank ? "" : it.done ? "X" : "",
      opts.blank ? "" : s(it.note),
      opts.blank ? "" : s(it.signature),
    ];
  });

  autoTable(doc, {
    startY: boxY + boxH + 5,
    head: [["TID", "KATEGORI", "UPPGIFT", "KLAR", "KOMMENTAR / AVVIKELSE", "SIGN"]],
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 1.6,
      lineColor: [110, 110, 110],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      minCellHeight: 7,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [235, 238, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle",
      minCellHeight: 9,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 42 },
      5: { cellWidth: 16, halign: "center" },
    },
    margin: { left: margin, right: margin, bottom: margin + 12 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (sectionRowIndexes.has(data.row.index)) {
        data.cell.styles.fillColor = [222, 227, 231];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8;
        data.cell.styles.halign = "left";
        if (data.column.index > 0) data.cell.text = [];
      }
    },
    willDrawCell: (data) => {
      // Slå ihop sektionsraden till en enda bred cell
      if (data.section === "body" && sectionRowIndexes.has(data.row.index) && data.column.index > 0) {
        data.cell.styles.lineWidth = { top: 0.2, bottom: 0.2, left: 0, right: data.column.index === 5 ? 0.2 : 0 } as any;
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
    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.line(margin, footY - 5, pageWidth - margin, footY - 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    const left = [s(opts.storeName), s(opts.date), s(opts.weekday), opts.status === "completed" ? "Slutford" : "Pagaende"]
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
