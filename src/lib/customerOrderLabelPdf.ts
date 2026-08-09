import jsPDF from "jspdf";

/**
 * Packetiketter för kundbeställningar, Brother QL-800 62 × 29 mm.
 * En etikett per vägd rad: produkt, vägd vikt, pris per kilo, totalpris,
 * packdatum, bäst före, partinummer och streckkod.
 */

const LABEL_W = 62;
const LABEL_H = 29;

export interface PackLabel {
  productName: string;
  weightKg: number;
  unit: string;
  pricePerUnit: number | null;
  total: number | null;
  packedDate: string;
  bestBefore?: string | null;
  lotNumber?: string | null;
  barcode?: string | null;
}

const nf = (v: number, d = 2) =>
  Number(v).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Enkel streckkodsliknande stapelrad utifrån teckenkoder (läsbar för QL-800). */
function drawBars(doc: jsPDF, value: string, x: number, y: number, w: number, h: number) {
  const chars = value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20) || "0";
  const unit = w / (chars.length * 4);
  let cx = x;
  doc.setFillColor(0, 0, 0);
  for (const ch of chars) {
    const code = ch.charCodeAt(0) % 4;
    for (let i = 0; i < 4; i++) {
      if ((code + i) % 2 === 0) doc.rect(cx, y, unit * 0.6, h, "F");
      cx += unit;
    }
  }
}

export function buildPackLabelDoc(labels: PackLabel[]) {
  const doc = new jsPDF({ unit: "mm", format: [LABEL_W, LABEL_H], orientation: "landscape" });
  let first = true;

  for (const l of labels) {
    if (!first) doc.addPage([LABEL_W, LABEL_H], "landscape");
    first = false;

    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(l.productName, LABEL_W - 6)[0] ?? "", 3, 5.5);

    doc.setFontSize(12);
    doc.text(`${nf(l.weightKg, 3)} ${l.unit}`, 3, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const right: string[] = [];
    if (l.pricePerUnit != null) right.push(`${nf(l.pricePerUnit)} kr/${l.unit}`);
    if (l.total != null) right.push(`${nf(l.total)} kr`);
    doc.text(right.join("   "), 3, 16.5);

    doc.setFontSize(6);
    const meta = [
      `Packat ${l.packedDate}`,
      l.bestBefore ? `Bäst före ${l.bestBefore}` : null,
      l.lotNumber ? `Parti ${l.lotNumber}` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    doc.text(meta, 3, 20);

    drawBars(doc, l.barcode || l.lotNumber || l.productName, 3, 21.5, LABEL_W - 6, 5);
  }

  return doc;
}

export function printPackLabels(labels: PackLabel[]) {
  if (labels.length === 0) return;
  const doc = buildPackLabelDoc(labels);
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}
