import jsPDF from "jspdf";
import QRCode from "qrcode";

/**
 * Partietikett för Brother QL (62 mm löpande rulle), 62 × 40 mm.
 * QR-koden länkar till partiets sida i Makrill.
 */
const W = 62;
const H = 40;

export interface LotLabel {
  lotId: string;
  lotNumber: string;
  species: string;
  latinName?: string | null;
  catchArea?: string | null;
  weightKg?: number | null;
  bestBefore?: string | null;
  supplier?: string | null;
}

const kg1 = (n: number) => Number(n).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const svDate = (d: string) => new Date(d).toLocaleDateString("sv-SE");

export const lotUrl = (lotId: string) => `${window.location.origin}/lot/${lotId}`;

export async function printLotLabels(labels: LotLabel[]) {
  const doc = new jsPDF({ unit: "mm", format: [W, H], orientation: "landscape" });
  let first = true;
  for (const l of labels) {
    if (!first) doc.addPage([W, H], "landscape");
    first = false;
    const qr = await QRCode.toDataURL(lotUrl(l.lotId), { margin: 0, width: 300, errorCorrectionLevel: "M" });
    doc.addImage(qr, "PNG", 2, 2, 22, 22);

    const x = 26;
    const tw = W - x - 2;
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const sp = doc.splitTextToSize(l.species || "–", tw).slice(0, 2);
    doc.text(sp, x, 5);
    let y = 5 + sp.length * 3.6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    if (l.latinName) { doc.text(doc.splitTextToSize(l.latinName, tw)[0], x, y); y += 3; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    if (l.catchArea) { doc.text(doc.splitTextToSize(`Fångst: ${l.catchArea}`, tw)[0], x, y); y += 3.2; }
    if (l.bestBefore) { doc.text(`Bäst före: ${svDate(l.bestBefore)}`, x, y); y += 3.2; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    if (l.weightKg != null) doc.text(`${kg1(l.weightKg)} kg`, x, 23);

    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.text(l.lotNumber || "", 2, 29.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    if (l.supplier) doc.text(doc.splitTextToSize(`Leverantör: ${l.supplier}`, W - 4).slice(0, 2), 2, 33.5);
  }
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}

/** Hämtar partiets uppgifter och skriver ut en etikett. */
export async function printLotLabelById(lotId: string, weightKg?: number | null) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("lots")
    .select("id, lot_number, commercial_name, latin_name, catch_area, best_before, quantity_kg, suppliers(name), products(name)")
    .eq("id", lotId)
    .maybeSingle();
  if (error || !data) throw new Error("Partiet hittades inte");
  const l: any = data;
  await printLotLabels([{
    lotId: l.id,
    lotNumber: l.lot_number,
    species: l.commercial_name || l.products?.name || "",
    latinName: l.latin_name,
    catchArea: l.catch_area,
    weightKg: weightKg ?? l.quantity_kg,
    bestBefore: l.best_before,
    supplier: l.suppliers?.name,
  }]);
}
