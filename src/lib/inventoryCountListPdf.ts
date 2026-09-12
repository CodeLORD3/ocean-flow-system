import jsPDF from "jspdf";

/**
 * FAS 1 — Utskriven inventeringslista (A4).
 *
 * Ren rapport från Lagrets produkter för butiken. Grupperad per kategori
 * (dynamiskt från Lager), sorterad kategori → namn (A–Ö). Varje rad har
 * produktbild (eller kategori-initial), kryssruta, namn + enhet och fyra
 * tomma fält: Kyldisk | Kylen | Totalt | Kval. (dagar kvar 1–7 / 7+).
 */

export interface CountListProduct {
  id?: string;
  name: string;
  unit?: string | null;
  category?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
}

export interface CountListOptions {
  storeName?: string | null;
  /** ISO-datum (yyyy-MM-dd). Default: dagens datum i svensk tid. */
  date?: string;
  /** Tomma rader längst ner för produkter som saknas i listan. */
  blankRows?: number;
  /** Ta med produktbilder (kräver nätverk). */
  withImages?: boolean;
}

const unitOf = (unit?: string | null) => {
  const u = String(unit ?? "kg").toLowerCase().trim();
  if (["st", "stk", "styck", "pcs", "pc", "piece"].includes(u)) return "st";
  return u || "kg";
};

const todayStockholm = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

/** Hämtar bilder som dataURL. Fel ignoreras — då ritas kategori-initialen. */
async function loadImages(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(urls.filter(Boolean))].slice(0, 250);
  const chunkSize = 12;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (url) => {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) return;
          const blob = await res.blob();
          if (!/^image\/(png|jpe?g|webp)/.test(blob.type)) return;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          });
          // jsPDF klarar png/jpeg direkt; webp ritas om via canvas
          if (blob.type.includes("webp")) {
            const png = await webpToPng(dataUrl);
            if (png) out.set(url, png);
          } else {
            out.set(url, dataUrl);
          }
        } catch {
          /* ignorera */
        }
      }),
    );
  }
  return out;
}

function webpToPng(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, 64, 64);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function buildInventoryCountListDoc(
  products: CountListProduct[],
  options: CountListOptions = {},
) {
  const blanks = options.blankRows ?? 8;
  const date = options.date || todayStockholm();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerW = pageW - margin * 2;

  // Kolumnmått
  const imgW = 7;
  const boxW = 17;
  const boxes = 4;
  const boxesW = boxW * boxes + 1.5 * (boxes - 1);
  const nameX = margin + imgW + 5.5;
  const boxesX = pageW - margin - boxesW;
  const nameW = boxesX - nameX - 2;

  const rowH = 7.4;
  const headerH = 27;
  const colHeadH = 6;
  const footerH = 20;
  const topY = margin + headerH + colHeadH;
  const bottomY = pageH - margin - footerH;
  const rowsPerPage = Math.floor((bottomY - topY) / rowH);

  // Gruppera per kategori (dynamiskt), sortera kategori → namn
  const groups = new Map<string, CountListProduct[]>();
  for (const p of products) {
    const key = (p.category || "Övrigt").trim() || "Övrigt";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const ordered = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "sv"))
    .map(([category, rows]) => ({
      category,
      rows: rows.slice().sort((a, b) => a.name.localeCompare(b.name, "sv")),
    }));

  type Row =
    | { kind: "category"; label: string; count: number }
    | { kind: "product"; product: CountListProduct }
    | { kind: "blank" };
  const rows: Row[] = [];
  ordered.forEach((g) => {
    rows.push({ kind: "category", label: g.category, count: g.rows.length });
    g.rows.forEach((product) => rows.push({ kind: "product", product }));
  });
  if (blanks > 0) {
    rows.push({ kind: "category", label: "Övriga produkter (fyll i själv)", count: 0 });
    for (let i = 0; i < blanks; i++) rows.push({ kind: "blank" });
  }

  const images =
    options.withImages === false
      ? new Map<string, string>()
      : await loadImages(products.map((p) => p.imageUrl || "").filter(Boolean));

  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const drawHeader = (page: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text("INVENTERINGSLISTA", margin, margin + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Sida ${page} av ${pages}`, pageW - margin, margin + 5, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(options.storeName || "Butik", margin, margin + 10.5);

    // Ifyllningsfält
    doc.setDrawColor(140);
    doc.setLineWidth(0.25);
    doc.setFontSize(8);
    doc.setTextColor(70);
    const fy = margin + 17;
    const fields: [string, number, number][] = [
      [`Datum: ${date}`, margin, 0],
      ["Ifylld av:", margin + 42, 40],
      ["Påbörjad kl:", margin + 92, 22],
      ["Klar kl:", margin + 138, 22],
    ];
    fields.forEach(([label, x, lineW]) => {
      doc.text(label, x, fy);
      if (lineW > 0) {
        const lx = x + doc.getTextWidth(label) + 1.5;
        doc.line(lx, fy + 0.7, Math.min(lx + lineW, pageW - margin), fy + 0.7);
      }
    });
    doc.setFontSize(7.2);
    doc.setTextColor(120);
    doc.text(
      "Kval. = antal dagar kvar på färskvaran: skriv 1–7 eller 7+. Fyll i mängd i produktens enhet (kg/st).",
      margin,
      fy + 5.4,
    );

    // Kolumnrubriker
    const cy = margin + headerH;
    doc.setFillColor(20, 45, 100);
    doc.rect(margin, cy, innerW, colHeadH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(255);
    doc.text("PRODUKT", nameX, cy + 4.1);
    ["Kyldisk", "Kylen", "Totalt", "Kval."].forEach((label, i) => {
      const bx = boxesX + i * (boxW + 1.5);
      doc.text(label.toUpperCase(), bx + boxW / 2, cy + 4.1, { align: "center" });
    });
    doc.setTextColor(0);
  };

  const drawFooter = (isLast: boolean) => {
    const y = pageH - margin - footerH + 6;
    doc.setDrawColor(150);
    doc.setLineWidth(0.25);
    if (isLast) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(70);
      doc.line(margin, y + 6, margin + 70, y + 6);
      doc.text("Signatur", margin, y + 10);
      doc.line(margin + 82, y + 6, margin + 152, y + 6);
      doc.text("Lämnad till", margin + 82, y + 10);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text("Makrill Trade · Inventering", margin, pageH - margin + 1);
    doc.text(`Utskriven: ${date}`, pageW - margin, pageH - margin + 1, { align: "right" });
    doc.setTextColor(0);
  };

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();
    drawHeader(page + 1);
    drawFooter(page === pages - 1);

    for (let r = 0; r < rowsPerPage; r++) {
      const row = rows[page * rowsPerPage + r];
      if (!row) break;
      const y = topY + r * rowH;
      const baseline = y + rowH - 2.6;

      if (row.kind === "category") {
        doc.setFillColor(226, 233, 245);
        doc.rect(margin, y + 0.4, innerW, rowH - 0.9, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(20, 45, 100);
        doc.text(row.label.toUpperCase(), margin + 1.5, baseline);
        if (row.count > 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.text(`${row.count} produkter`, pageW - margin - 1.5, baseline, { align: "right" });
        }
        doc.setTextColor(0);
        continue;
      }

      // Bild / kategori-initial
      const imgY = y + 0.6;
      const imgH = rowH - 1.6;
      if (row.kind === "product") {
        const url = row.product.imageUrl || "";
        const data = url ? images.get(url) : undefined;
        if (data) {
          try {
            doc.addImage(data, margin, imgY, imgW, imgH, undefined, "FAST");
          } catch {
            /* ignorera */
          }
        } else {
          doc.setFillColor(232, 236, 243);
          doc.rect(margin, imgY, imgW, imgH, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(120, 132, 158);
          const initial = (row.product.category || "Ö").trim().charAt(0).toUpperCase();
          doc.text(initial, margin + imgW / 2, imgY + imgH / 2 + 1.2, { align: "center" });
          doc.setTextColor(0);
        }
      }

      // Kryssruta
      doc.setDrawColor(120);
      doc.setLineWidth(0.25);
      doc.rect(margin + imgW + 1.2, y + rowH / 2 - 1.7, 3.4, 3.4);

      // Namn + enhet
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      if (row.kind === "product") {
        const unit = unitOf(row.product.unit);
        const name = doc.splitTextToSize(row.product.name, nameW - 10)[0] as string;
        doc.setTextColor(0);
        doc.text(name, nameX, baseline);
        const nw = doc.getTextWidth(name);
        doc.setFontSize(6.8);
        doc.setTextColor(120);
        doc.text(`(${unit})`, nameX + nw + 1.5, baseline);
        doc.setTextColor(0);
      } else {
        doc.setDrawColor(195);
        doc.setLineWidth(0.2);
        doc.line(nameX, baseline + 0.8, nameX + nameW, baseline + 0.8);
      }

      // Fyra tomma fält
      for (let i = 0; i < boxes; i++) {
        const bx = boxesX + i * (boxW + 1.5);
        doc.setDrawColor(120);
        doc.setLineWidth(0.25);
        doc.rect(bx, y + 0.7, boxW, rowH - 1.8);
      }

      // Tunn radavgränsare
      doc.setDrawColor(228);
      doc.setLineWidth(0.15);
      doc.line(margin, y + rowH - 0.2, pageW - margin, y + rowH - 0.2);
    }
  }

  return doc;
}

export async function generateInventoryCountListPdf(
  products: CountListProduct[],
  options: CountListOptions = {},
) {
  const doc = await buildInventoryCountListDoc(products, options);
  const store = (options.storeName || "butik").replace(/[^\w\d-]+/g, "_");
  doc.save(`Inventeringslista-${store}-${options.date || todayStockholm()}.pdf`);
}
