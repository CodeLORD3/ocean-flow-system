import jsPDF from "jspdf";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

/**
 * Partietikett för Brother QL-800 med rulle DK-11208 (38 × 90 mm), stående.
 * En etikett per sida, exakt 38 × 90 mm, så att den skrivs ut i 100 % skala.
 * QR-koden länkar till partiets sida på den publicerade adressen.
 */
export const LABEL_W = 38;
export const LABEL_H = 90;

/** Publicerad adress, aldrig förhandsvisningen. */
export const PUBLIC_APP_URL = "https://makrilltrade.com";

export interface LotLabel {
  lotId: string;
  lotNumber: string;
  productName: string;
  species?: string | null;
  latinName?: string | null;
  catchArea?: string | null;
  fishingGear?: string | null;
  /** "Tillverkat" eller "Mottaget". */
  dateLabel?: string | null;
  date?: string | null;
  weightKg?: number | null;
  bestBefore?: string | null;
  /** Leverantör eller "Egen tillverkning FSAB". */
  origin?: string | null;
}

const kg1 = (n: number) => Number(n).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const svDate = (d: string) => new Date(d).toLocaleDateString("sv-SE");

export const lotUrl = (lotId: string) => `${PUBLIC_APP_URL}/lot/${lotId}`;

function code128(value: string): string | null {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, { format: "CODE128", displayValue: false, margin: 0, height: 60, width: 2 });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Skapar PDF:en. copies = antal exemplar av varje etikett. */
export async function buildLotLabelPdf(labels: LotLabel[], copies = 1): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: [LABEL_W, LABEL_H], orientation: "portrait" });
  const n = Math.max(1, Math.floor(copies));
  const x = 2;
  const tw = LABEL_W - 4;
  let first = true;
  for (const l of labels) {
    const qr = await QRCode.toDataURL(lotUrl(l.lotId), { margin: 0, width: 400, errorCorrectionLevel: "M" });
    const bc = code128(l.lotNumber);
    for (let c = 0; c < n; c++) {
      if (!first) doc.addPage([LABEL_W, LABEL_H], "portrait");
      first = false;
      doc.setTextColor(0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const title = doc.splitTextToSize(l.productName || "–", tw).slice(0, 3);
      doc.text(title, x, 5);
      let y = 5 + title.length * 3.8;

      const sp = [l.species, l.latinName].filter(Boolean).join(" · ");
      if (sp) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.5);
        const s = doc.splitTextToSize(sp, tw).slice(0, 2);
        doc.text(s, x, y);
        y += s.length * 2.8;
      }

      const qrSize = 28;
      const qrY = Math.max(y, 17);
      doc.addImage(qr, "PNG", (LABEL_W - qrSize) / 2, qrY, qrSize, qrSize);
      y = qrY + qrSize + 3.2;

      doc.setFont("courier", "bold");
      doc.setFontSize(7.5);
      const ln = doc.splitTextToSize(l.lotNumber || "", tw).slice(0, 2);
      doc.text(ln, LABEL_W / 2, y, { align: "center" });
      y += ln.length * 3 - 1.5;

      if (bc) {
        doc.addImage(bc, "PNG", x, y, tw, 6);
        y += 6 + 3;
      } else {
        y += 2;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      const line = (t: string, max = 1) => {
        const parts = doc.splitTextToSize(t, tw).slice(0, max);
        doc.text(parts, x, y);
        y += parts.length * 2.8;
      };
      if (l.catchArea) line(`Fångst: ${l.catchArea}`, 2);
      if (l.fishingGear) line(`Redskap: ${l.fishingGear}`);
      if (l.date) line(`${l.dateLabel || "Datum"}: ${svDate(l.date)}`);
      if (l.bestBefore) {
        doc.setFont("helvetica", "bold");
        line(`Bäst före: ${svDate(l.bestBefore)}`);
        doc.setFont("helvetica", "normal");
      }
      if (l.origin) line(l.origin, 2);

      if (l.weightKg != null) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(`${kg1(l.weightKg)} kg`, x, LABEL_H - 3);
      }
    }
  }
  return doc;
}

export async function printLotLabels(labels: LotLabel[], copies = 1) {
  if (!labels.length) throw new Error("Inga etiketter att skriva ut.");
  const doc = await buildLotLabelPdf(labels, copies);
  doc.autoPrint();
  const url = doc.output("bloburl") as unknown as string;
  const w = window.open(url, "_blank");
  if (!w) throw new Error("Webbläsaren stoppade utskriftsfönstret. Tillåt popupfönster för Makrill och försök igen.");
}

const ENTITY_SHORT: Record<string, string> = { "fsab-se": "FSAB", "de-no1": "DE No.1" };

/** Hämtar partiets uppgifter och bygger etikettdata. */
export async function loadLotLabel(lotId: string, weightKg?: number | null): Promise<LotLabel> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("lots")
    .select("id, lot_number, commercial_name, latin_name, catch_area, fishing_gear, best_before, produced_on, created_at, quantity_kg, legal_entity_id, suppliers(name), products(name)")
    .eq("id", lotId)
    .maybeSingle();
  if (error || !data) throw new Error("Partiet hittades inte");
  const l: any = data;
  let received: string | null = null;
  if (!l.produced_on) {
    const { data: d } = await supabase
      .from("incoming_delivery_lines")
      .select("incoming_deliveries(received_date)")
      .eq("lot_id", lotId)
      .limit(1);
    received = (d as any)?.[0]?.incoming_deliveries?.received_date ?? null;
  }
  const own = !!l.produced_on;
  const entity = ENTITY_SHORT[l.legal_entity_id ?? "fsab-se"] ?? (l.legal_entity_id?.includes("compon") ? "Componia" : "FSAB");
  return {
    lotId: l.id,
    lotNumber: l.lot_number,
    productName: l.products?.name || l.commercial_name || "",
    species: l.commercial_name && l.commercial_name !== l.products?.name ? l.commercial_name : null,
    latinName: l.latin_name,
    catchArea: l.catch_area,
    fishingGear: l.fishing_gear,
    dateLabel: own ? "Tillverkat" : "Mottaget",
    date: own ? l.produced_on : received ?? (l.created_at ? String(l.created_at).slice(0, 10) : null),
    weightKg: weightKg ?? l.quantity_kg,
    bestBefore: l.best_before,
    origin: own ? `Egen tillverkning ${entity}` : l.suppliers?.name ? `Leverantör: ${l.suppliers.name}` : null,
  };
}

/** Hämtar partiets uppgifter och skriver ut etiketten i valfritt antal. */
export async function printLotLabelById(lotId: string, weightKg?: number | null, copies = 1) {
  await printLotLabels([await loadLotLabel(lotId, weightKg)], copies);
}

/** Skriver ut flera partier, med eget antal exemplar per parti. */
export async function printLotLabelsByIds(items: { lotId: string; weightKg?: number | null; copies: number }[]) {
  const labels: LotLabel[] = [];
  for (const it of items) {
    const l = await loadLotLabel(it.lotId, it.weightKg);
    for (let i = 0; i < Math.max(1, it.copies); i++) labels.push(l);
  }
  await printLotLabels(labels, 1);
}
