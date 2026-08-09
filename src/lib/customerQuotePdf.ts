import jsPDF from "jspdf";

/**
 * Preliminär offert för en cateringförfrågan.
 * Priset är alltid preliminärt — dagens pris gäller vid hämtning.
 */

export interface QuoteLine {
  name: string;
  quantity: number;
  unit: string;
  pricePerUnit: number | null;
  note?: string | null;
}

export interface QuoteInput {
  orderNumber: string;
  storeName: string;
  customerName: string;
  customerPhone?: string | null;
  orderTypeLabel: string;
  wantedDate: string;
  wantedTime?: string | null;
  guestCount?: number | null;
  allergyNote?: string | null;
  excludedAllergens?: string[];
  deliveryAddress?: string | null;
  note?: string | null;
  lines: QuoteLine[];
}

const nf = (v: number, d = 2) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

export function buildQuoteDoc(input: QuoteInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Preliminär offert", left, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${input.storeName} · ${input.orderNumber}`, left, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(input.customerName, left, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (input.customerPhone) {
    doc.text(input.customerPhone, left, y);
    y += 5;
  }
  doc.text(
    `${input.orderTypeLabel} ${input.wantedDate}${input.wantedTime ? ` kl ${input.wantedTime.slice(0, 5)}` : ""}`,
    left,
    y,
  );
  y += 5;
  if (input.deliveryAddress) {
    doc.text(input.deliveryAddress, left, y);
    y += 5;
  }
  if (input.guestCount) {
    doc.text(`Antal gäster: ${input.guestCount}`, left, y);
    y += 5;
  }
  if (input.allergyNote || (input.excludedAllergens || []).length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text(
      `Allergi: ${[input.allergyNote, (input.excludedAllergens || []).join(", ")]
        .filter(Boolean)
        .join(" · ")}`,
      left,
      y,
    );
    doc.setFont("helvetica", "normal");
    y += 5;
  }

  y += 5;
  doc.setDrawColor(180);
  doc.line(left, y, 194, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Vara", left, y);
  doc.text("Mängd", 118, y, { align: "right" });
  doc.text("Pris", 150, y, { align: "right" });
  doc.text("Summa", 194, y, { align: "right" });
  y += 4;
  doc.line(left, y, 194, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  let total = 0;
  for (const l of input.lines) {
    const sum = l.pricePerUnit != null ? l.quantity * l.pricePerUnit : 0;
    total += sum;
    doc.text(doc.splitTextToSize(l.name, 92)[0] ?? "", left, y);
    doc.text(`${nf(l.quantity, 3)} ${l.unit}`, 118, y, { align: "right" });
    doc.text(l.pricePerUnit != null ? `${nf(l.pricePerUnit)} kr` : "—", 150, y, { align: "right" });
    doc.text(l.pricePerUnit != null ? `${nf(sum)} kr` : "—", 194, y, { align: "right" });
    y += 5;
    if (l.note) {
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(l.note, left + 3, y);
      doc.setTextColor(0);
      doc.setFontSize(9);
      y += 5;
    }
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
  }

  y += 2;
  doc.line(left, y, 194, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Preliminär summa", left, y);
  doc.text(`${nf(total)} kr`, 194, y, { align: "right" });
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const foot = doc.splitTextToSize(
    "Detta är en preliminär offert. Priset räknas om mot dagens pris vid packning och betalning sker i kassan vid hämtning. Vägd vikt kan avvika något från beställd mängd.",
    178,
  );
  doc.text(foot, left, y);
  y += foot.length * 4 + 4;
  if (input.note) {
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(`Anteckning: ${input.note}`, 178), left, y);
  }

  return doc;
}

export function printQuote(input: QuoteInput) {
  const doc = buildQuoteDoc(input);
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}
