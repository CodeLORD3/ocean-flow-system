import jsPDF from "jspdf";
import QRCode from "qrcode";

/**
 * Partietiketter för Brother QL-800. Formatet är 62 × 29 mm (DK-11209/DK-22205
 * kapad), en etikett per sida så att skrivaren matar rätt. QR-koden innehåller
 * partinummret, så en skanning i lagret leder direkt till rätt parti.
 */

export interface LotLabel {
  lotNumber: string;
  productName: string;
  quantityKg?: number | null;
  catchArea?: string | null;
  vesselName?: string | null;
  bestBefore?: string | null;
  supplierLotNumber?: string | null;
}

const LABEL_W = 62;
const LABEL_H = 29;

const nf = (v: number | null | undefined) =>
  v === null || v === undefined
    ? null
    : Number(v).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function qrDataUrl(value: string) {
  return QRCode.toDataURL(value, { margin: 0, width: 200, errorCorrectionLevel: "M" });
}

export async function buildLotLabelDoc(labels: LotLabel[], copiesPerLabel = 1) {
  const doc = new jsPDF({ unit: "mm", format: [LABEL_W, LABEL_H], orientation: "landscape" });
  let first = true;

  for (const label of labels) {
    const qr = await qrDataUrl(label.lotNumber);
    for (let c = 0; c < Math.max(1, copiesPerLabel); c++) {
      if (!first) doc.addPage([LABEL_W, LABEL_H], "landscape");
      first = false;

      const qrSize = 21;
      doc.addImage(qr, "PNG", LABEL_W - qrSize - 2, (LABEL_H - qrSize) / 2, qrSize, qrSize);

      const textWidth = LABEL_W - qrSize - 7;
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(label.productName, textWidth)[0] ?? "", 3, 6);

      doc.setFontSize(10);
      doc.text(label.lotNumber, 3, 11.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      const rows = [
        nf(label.quantityKg) ? `${nf(label.quantityKg)} kg` : null,
        label.catchArea,
        label.vesselName,
        label.bestBefore ? `Bäst före ${label.bestBefore}` : null,
        label.supplierLotNumber ? `Lev.parti ${label.supplierLotNumber}` : null,
      ].filter(Boolean) as string[];

      let y = 15.5;
      for (const row of rows.slice(0, 4)) {
        doc.text(doc.splitTextToSize(row, textWidth)[0] ?? "", 3, y);
        y += 3.1;
      }
    }
  }

  return doc;
}

/** Öppnar etiketterna i ny flik — därifrån skrivs de ut på QL-800. */
export async function openLotLabels(labels: LotLabel[], copiesPerLabel = 1) {
  const doc = await buildLotLabelDoc(labels, copiesPerLabel);
  window.open(doc.output("bloburl") as any, "_blank");
}

export async function downloadLotLabels(labels: LotLabel[], copiesPerLabel = 1) {
  const doc = await buildLotLabelDoc(labels, copiesPerLabel);
  doc.save(`partietiketter-${new Date().toISOString().slice(0, 10)}.pdf`);
}
