import jsPDF from "jspdf";
import { format } from "date-fns";

export interface PosterRow {
  name: string;
  price: number;
  /** Enhetstext efter priset, t.ex. "kr/kg" eller "kr/st". */
  unitLabel: string;
}

export interface PosterSection {
  title: string;
  rows: PosterRow[];
}

export interface PosterOptions {
  title: string;
  subtitle?: string | null;
  sections: PosterSection[];
  dateStr?: string;
  /** Visas nere till höger, t.ex. butiksnamn. */
  footer?: string | null;
}

const NAVY: [number, number, number] = [16, 58, 145];
const BLUE: [number, number, number] = [56, 130, 235];
const RED: [number, number, number] = [214, 24, 24];
const GREY: [number, number, number] = [130, 130, 130];

/**
 * Skriver ut en prislista som affisch: två spalter, kategorirubriker och
 * priserna i rött — samma upplägg som butikernas handskrivna tavlor.
 */
export function generatePricePosterPdf(opts: PosterOptions) {
  const dateStr = opts.dateStr || format(new Date(), "yyyy-MM-dd");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 34;
  const gutter = 26;
  const colW = (pageW - margin * 2 - gutter) / 2;
  const bottom = pageH - 42;

  const rowH = 22;
  const sectionHeadH = 40;

  let page = 1;
  let col = 0;
  let y = 0;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(34);
    doc.setTextColor(...NAVY);
    doc.text(opts.title.toUpperCase(), pageW / 2, margin + 26, { align: "center" });
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(3);
    const w = Math.min(pageW - margin * 2, doc.getTextWidth(opts.title.toUpperCase()) + 20);
    doc.line(pageW / 2 - w / 2, margin + 34, pageW / 2 + w / 2, margin + 34);

    let top = margin + 56;
    if (opts.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...GREY);
      doc.text(opts.subtitle, pageW / 2, top, { align: "center" });
      top += 16;
    }
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(dateStr, pageW / 2, top, { align: "center" });
    return top + 14;
  };

  const drawFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    if (opts.footer) doc.text(opts.footer, margin, pageH - 22);
    doc.text(`Sida ${page}`, pageW - margin, pageH - 22, { align: "right" });
    doc.setTextColor(0);
  };

  const contentTop = drawHeader();
  y = contentTop;

  const nextColumn = () => {
    if (col === 0) {
      col = 1;
      y = contentTop;
      // Mittlinje mellan spalterna
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(1.5);
      doc.line(margin + colW + gutter / 2, contentTop, margin + colW + gutter / 2, bottom);
    } else {
      drawFooter();
      doc.addPage();
      page += 1;
      col = 0;
      y = contentTop;
    }
  };

  const colX = () => margin + col * (colW + gutter);

  const drawSectionTitle = (title: string) => {
    const x = colX();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...NAVY);
    doc.text(title.toUpperCase(), x, y + 20);
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(2.5);
    const w = Math.min(colW, doc.getTextWidth(title.toUpperCase()) + 12);
    doc.line(x, y + 27, x + w, y + 27);
    y += sectionHeadH;
  };

  const drawRow = (row: PosterRow) => {
    const x = colX();
    const priceText = formatPosterPrice(row.price);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...RED);
    const unitW = 30;
    const priceW = doc.getTextWidth(priceText);
    const priceRight = x + colW - unitW;
    doc.text(priceText, priceRight, y + 14, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(row.unitLabel, priceRight + 4, y + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(20);
    const nameMax = colW - unitW - priceW - 14;
    let name = row.name;
    while (doc.getTextWidth(name) > nameMax && name.length > 4) {
      name = name.slice(0, -2);
    }
    if (name !== row.name) name = name.trimEnd() + "…";
    doc.text(name, x, y + 14);

    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.6);
    doc.line(x, y + rowH - 2, x + colW, y + rowH - 2);
    y += rowH;
  };

  for (const section of opts.sections) {
    if (!section.rows.length) continue;
    // Rubrik ska aldrig hamna sist i en spalt utan minst en rad under sig.
    if (y + sectionHeadH + rowH > bottom) nextColumn();
    drawSectionTitle(section.title);
    for (const row of section.rows) {
      if (y + rowH > bottom) {
        nextColumn();
        drawSectionTitle(section.title);
      }
      drawRow(row);
    }
    y += 14;
  }

  drawFooter();

  const safe = opts.title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
  doc.save(`prislista-affisch-${safe}-${dateStr}.pdf`);
}

/** 249 istället för 249,00 när priset är helt — precis som på tavlorna. */
export function formatPosterPrice(v: number): string {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}
