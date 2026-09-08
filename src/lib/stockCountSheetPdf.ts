import jsPDF from "jspdf";

/**
 * Linjerat räkneblad för lagerrapport (A4) — att skriva ut och fylla i för hand
 * när täckningen i kylen är dålig. Produkterna är förskrivna per kategori och
 * varje kategori får extra tomma linjer för produkter som saknas i listan.
 */

export interface StockSheetProduct {
  name: string;
  unit?: string | null;
  category?: string | null;
}

export interface StockCountSheetOptions {
  storeName?: string | null;
  date?: string;
  /** Antal tomma handskrivningsrader per kategori. */
  blankRowsPerCategory?: number;
}

const unitOf = (unit?: string | null) => {
  const u = String(unit ?? "kg").toLowerCase().trim();
  if (["st", "stk", "styck", "pcs", "pc", "piece"].includes(u)) return "st";
  return u || "kg";
};

export function buildStockCountSheetDoc(
  products: StockSheetProduct[],
  options: StockCountSheetOptions = {},
) {
  const blanks = options.blankRowsPerCategory ?? 3;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 9;
  const headerH = 19;
  const footerH = 7;
  const gutter = 4;
  const cols = 3;
  const colW = (pageW - margin * 2 - gutter * (cols - 1)) / cols;
  const rowH = 5.1;
  const boxW = 15;
  const unitW = 5.5;
  const nameW = colW - boxW - unitW - 1.5;
  const topY = margin + headerH;
  const bottomY = pageH - margin - footerH;
  const rowsPerCol = Math.floor((bottomY - topY) / rowH);

  // Gruppera per kategori
  const groups = new Map<string, StockSheetProduct[]>();
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

  // Bygg en platt lista av rader: kategori-rubrik, produktrad eller tom rad
  type Row =
    | { kind: "category"; label: string }
    | { kind: "product"; label: string; unit: string }
    | { kind: "blank"; unit: string };
  const rows: Row[] = [];
  ordered.forEach((g) => {
    rows.push({ kind: "category", label: g.category });
    g.rows.forEach((p) => rows.push({ kind: "product", label: p.name, unit: unitOf(p.unit) }));
    for (let i = 0; i < blanks; i++) rows.push({ kind: "blank", unit: "" });
  });

  const date = options.date || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

  const drawHeader = (page: number, pages: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text("LAGERRAPPORT — RÄKNEBLAD", margin, margin + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(
      `${options.storeName || "Butik"} · Fyll i mängd i produktens enhet (kg/st). Tomma rader = egna produkter.`,
      margin,
      margin + 10,
    );
    // Ifyllningsfält för datum/ansvarig
    doc.setDrawColor(140);
    doc.setLineWidth(0.25);
    const fy = margin + 15;
    doc.setFontSize(8);
    doc.text(`Datum: ${date}`, margin, fy);
    doc.text("Räknad av:", margin + 40, fy);
    doc.line(margin + 58, fy + 0.6, margin + 110, fy + 0.6);
    doc.text("Signatur:", margin + 116, fy);
    doc.line(margin + 132, fy + 0.6, pageW - margin, fy + 0.6);
    doc.text(`Sida ${page} av ${pages}`, pageW - margin, margin + 5, { align: "right" });
    doc.setTextColor(0);
  };

  const drawFooter = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      "Skriv in siffrorna i systemet när du har täckning igen. Makrill Trade.",
      margin,
      pageH - margin,
    );
    doc.setTextColor(0);
  };

  // Sidindelning
  const perPage = rowsPerCol * cols;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();
    drawHeader(page + 1, pages);
    drawFooter();

    for (let c = 0; c < cols; c++) {
      const x = margin + c * (colW + gutter);
      for (let r = 0; r < rowsPerCol; r++) {
        const row = rows[page * perPage + c * rowsPerCol + r];
        if (!row) break;
        const y = topY + r * rowH;
        const baseline = y + rowH - 1.6;

        if (row.kind === "category") {
          doc.setFillColor(226, 233, 245);
          doc.rect(x, y + 0.4, colW, rowH - 0.8, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(20, 45, 100);
          doc.text(row.label.toUpperCase().slice(0, 34), x + 1.2, baseline - 0.2);
          doc.setTextColor(0);
          continue;
        }

        // Namn
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.6);
        if (row.kind === "product") {
          const name = doc.splitTextToSize(row.label, nameW)[0] as string;
          doc.setTextColor(0);
          doc.text(name, x + 1.2, baseline);
        } else {
          // Handskriven produkt: linje att skriva namnet på
          doc.setDrawColor(190);
          doc.setLineWidth(0.2);
          doc.line(x + 1.2, baseline + 0.6, x + nameW, baseline + 0.6);
        }

        // Mängdruta
        const bx = x + colW - boxW - unitW;
        doc.setDrawColor(120);
        doc.setLineWidth(0.25);
        doc.rect(bx, y + 0.5, boxW, rowH - 1);
        doc.setFontSize(6.5);
        doc.setTextColor(110);
        doc.text(row.unit || "kg/st", bx + boxW + 1, baseline - 0.2);
        doc.setTextColor(0);
      }
    }
  }

  return doc;
}

export function generateStockCountSheetPdf(
  products: StockSheetProduct[],
  options: StockCountSheetOptions = {},
) {
  const doc = buildStockCountSheetDoc(products, options);
  const store = (options.storeName || "butik").replace(/[^\w\d-]+/g, "_");
  doc.save(`Lagerrapport-rakneblad-${store}-${options.date || ""}.pdf`);
}
