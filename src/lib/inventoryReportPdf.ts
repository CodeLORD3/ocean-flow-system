import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InventoryReportPdfLine {
  product_name: string;
  category?: string | null;
  unit?: string | null;
  quantity: number;
  cost_price: number;
  line_value: number;
}

export interface InventoryReportPdfData {
  storeName?: string | null;
  locationName?: string | null;
  reportedAt: string;
  reportedBy?: string | null;
  notes?: string | null;
  lineCount: number;
  totalValue: number;
  lines: InventoryReportPdfLine[];
}

const nf = (v: number, dec = 1) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function buildInventoryReportDoc(data: InventoryReportPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const innerWidth = pageWidth - margin * 2;

  // Rubrik
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("LAGERRAPPORT", pageWidth / 2, margin + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(70);
  doc.text(
    [data.storeName, data.locationName].filter(Boolean).join(" › ") || "—",
    pageWidth / 2,
    margin + 15,
    { align: "center" },
  );
  doc.setTextColor(0);

  // Infobox
  const boxY = margin + 20;
  const boxH = 16;
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(margin, boxY, innerWidth, boxH);
  const reported = new Date(data.reportedAt).toLocaleString("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const cells: [string, string][] = [
    ["Rapporterad", reported],
    ["Antal rader", String(data.lineCount)],
    ["Lagervärde", `${nf(data.totalValue, 0)} kr`],
    ["Inventerad av", data.reportedBy || "—"],
  ];
  const colW = innerWidth / cells.length;
  cells.forEach(([label, value], i) => {
    const x = margin + i * colW + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), x, boxY + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(value, x, boxY + 12.5);
    if (i > 0) doc.line(margin + i * colW, boxY, margin + i * colW, boxY + boxH);
  });

  // Rader grupperade per kategori
  const groups = new Map<string, InventoryReportPdfLine[]>();
  data.lines.forEach((l) => {
    const cat = l.category || "Övrigt";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(l);
  });

  const body: any[] = [];
  [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "sv"))
    .forEach(([cat, lines]) => {
      const catQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
      const catVal = lines.reduce((s, l) => s + Number(l.line_value || 0), 0);
      body.push([
        { content: cat.toUpperCase(), colSpan: 2, styles: { fontStyle: "bold", fillColor: [232, 238, 248] } },
        { content: nf(catQty), styles: { fontStyle: "bold", fillColor: [232, 238, 248], halign: "right" } },
        { content: "", styles: { fillColor: [232, 238, 248] } },
        { content: `${nf(catVal, 0)} kr`, styles: { fontStyle: "bold", fillColor: [232, 238, 248], halign: "right" } },
      ]);
      lines
        .slice()
        .sort((a, b) => a.product_name.localeCompare(b.product_name, "sv"))
        .forEach((l, i) => {
          body.push([
            String(i + 1),
            l.product_name,
            `${nf(l.quantity)} ${l.unit || "kg"}`,
            `${nf(l.cost_price, 2)} kr`,
            `${nf(l.line_value, 0)} kr`,
          ]);
        });
    });

  body.push([
    { content: "TOTALT", colSpan: 2, styles: { fontStyle: "bold", fillColor: [222, 222, 222] } },
    {
      content: nf(data.lines.reduce((s, l) => s + Number(l.quantity || 0), 0)),
      styles: { fontStyle: "bold", fillColor: [222, 222, 222], halign: "right" },
    },
    { content: "", styles: { fillColor: [222, 222, 222] } },
    {
      content: `${nf(data.totalValue, 0)} kr`,
      styles: { fontStyle: "bold", fillColor: [222, 222, 222], halign: "right" },
    },
  ]);

  autoTable(doc, {
    startY: boxY + boxH + 5,
    head: [["#", "Produkt", "Antal", "Snittpris", "Värde"]],
    body,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [200, 200, 200], lineWidth: 0.2 },
    headStyles: { fillColor: [20, 50, 130], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  let y = ((doc as any).lastAutoTable?.finalY || boxY + boxH + 5) + 8;
  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("NOTERINGAR:", margin, y);
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(data.notes, innerWidth);
    doc.text(split, margin, y + 5);
    y += 5 + split.length * 4.5;
  }

  // Signaturrader
  if (y < pageHeight - 30) {
    y = Math.max(y + 6, pageHeight - 28);
    doc.setDrawColor(150);
    doc.line(margin, y, margin + 60, y);
    doc.line(margin + 75, y, margin + 135, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("Inventerad av", margin, y + 4);
    doc.text("Godkänd av", margin + 75, y + 4);
    doc.setTextColor(0);
  }

  // Fot
  const footY = pageHeight - margin + 4;
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(
    `Utskriven: ${new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`,
    margin,
    footY,
  );
  doc.text("Makrilltrade", pageWidth - margin, footY, { align: "right" });
  doc.setTextColor(0);

  return doc;
}

export function generateInventoryReportPdf(data: InventoryReportPdfData, fileName?: string) {
  const doc = buildInventoryReportDoc(data);
  doc.save(
    fileName ||
      `Lagerrapport-${(data.locationName || "lager").replace(/[^\w\d-]+/g, "_")}-${data.reportedAt.slice(0, 10)}.pdf`,
  );
}
