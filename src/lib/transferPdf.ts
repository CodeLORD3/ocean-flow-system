import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Plocklista och följesedel. Papperet är alltid en kopia av systemet:
 * ordernummer, underlag och nivåer skrivs ut så att en avvikelse kan spåras
 * tillbaka till rätt order.
 */

export interface TransferPdfLine {
  productName: string;
  lotNumber?: string | null;
  quantityOrdered: number;
  quantityPicked?: number | null;
  quantityShipped?: number | null;
  deviationReason?: string | null;
}

export interface TransferPdfData {
  kind: "plocklista" | "foljesedel";
  orderNumber: string;
  fromName: string;
  fromLevel: string;
  toName: string;
  toLevel: string;
  sourceDocumentLabel?: string | null;
  createdAt: string;
  createdBy?: string | null;
  reason?: string | null;
  lines: TransferPdfLine[];
}

const nf = (v: number | null | undefined, dec = 1) =>
  v === null || v === undefined
    ? ""
    : Number(v).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const dateText = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

export function buildTransferDoc(data: TransferPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const isPick = data.kind === "plocklista";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(isPick ? "PLOCKLISTA" : "FÖLJESEDEL", pageWidth / 2, margin + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(70);
  doc.text(data.orderNumber, pageWidth / 2, margin + 15, { align: "center" });
  doc.setTextColor(0);

  const meta: [string, string][] = [
    ["Från", `${data.fromName} (${data.fromLevel})`],
    ["Till", `${data.toName} (${data.toLevel})`],
    ["Underlag", data.sourceDocumentLabel || "—"],
    ["Skapad", `${dateText(data.createdAt)}${data.createdBy ? ` · ${data.createdBy}` : ""}`],
  ];
  if (data.reason) meta.push(["Orsak", data.reason]);

  autoTable(doc, {
    startY: margin + 22,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 26 } },
    body: meta,
  });

  const head = isPick
    ? [["Produkt", "Parti", "Beställt kg", "Plockat kg", "Avvikelseorsak"]]
    : [["Produkt", "Parti", "Beställt kg", "Skickat kg", "Mottaget kg"]];

  const body = data.lines.map((l) =>
    isPick
      ? [l.productName, l.lotNumber || "—", nf(l.quantityOrdered), "", ""]
      : [
          l.productName,
          l.lotNumber || "—",
          nf(l.quantityOrdered),
          nf(l.quantityShipped ?? l.quantityPicked),
          "",
        ],
  );

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    margin: { left: margin, right: margin },
    head,
    body,
    styles: { fontSize: 9, cellPadding: 2, minCellHeight: 9 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 22 },
      4: { cellWidth: 34 },
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 12;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    isPick
      ? "Registrera plockningen i systemet direkt efter plockning. Avvikelse kräver orsak."
      : "Mottagaren registrerar mottagen kvantitet. Differens bokförs som svinn hos avsändaren.",
    margin,
    y,
  );
  doc.setTextColor(0);

  y += 14;
  const colWidth = (pageWidth - margin * 2) / 2 - 6;
  const labels = isPick ? ["Plockad av", "Godkänd utleverans"] : ["Utlämnad av", "Mottagen av"];
  labels.forEach((label, i) => {
    const x = margin + i * (colWidth + 12);
    doc.line(x, y, x + colWidth, y);
    doc.setFontSize(8);
    doc.text(label, x, y + 4);
  });

  return doc;
}

export function openTransferPdf(data: TransferPdfData) {
  const doc = buildTransferDoc(data);
  const url = doc.output("bloburl");
  window.open(url as any, "_blank");
}

export function downloadTransferPdf(data: TransferPdfData) {
  const doc = buildTransferDoc(data);
  doc.save(`${data.kind}-${data.orderNumber}.pdf`);
}
