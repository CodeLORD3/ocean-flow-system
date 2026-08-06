import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  diffOf,
  diffValueOf,
  expectedOf,
  REASON_LABEL,
  soldTotalOf,
  totalsOf,
  type DailySheetLine,
} from "@/lib/dailySheet";

export interface DailySheetPdfData {
  storeName?: string | null;
  locationName?: string | null;
  sheetDate: string;
  openedBy?: string | null;
  closedBy?: string | null;
  notes?: string | null;
  lines: DailySheetLine[];
  /** "arbetsblad" = tomma rutor för kvällens räkning, "slutrapport" = ifylld och signerad */
  variant: "arbetsblad" | "slutrapport";
  currency?: string;
}

const nf = (v: number, dec = 1) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const weekday = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

export function buildDailySheetDoc(data: DailySheetPdfData) {
  const isWorksheet = data.variant === "arbetsblad";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;
  const cur = data.currency || "kr";
  const t = totalsOf(data.lines);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(isWorksheet ? "DAGSAVSTÄMNING — ARBETSBLAD" : "DAGSAVSTÄMNING LAGER", pageWidth / 2, margin + 7, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70);
  doc.text(
    [data.storeName, data.locationName].filter(Boolean).join(" › ") || "—",
    pageWidth / 2,
    margin + 13,
    { align: "center" },
  );
  doc.setTextColor(0);

  // Infobox
  const boxY = margin + 17;
  const boxH = 15;
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(margin, boxY, innerWidth, boxH);
  const cells: [string, string][] = [
    ["Datum", weekday(data.sheetDate)],
    ["Ingående lager", `${nf(t.opening)} kg`],
    ["Inlevererat i dag", `${nf(t.received)} kg`],
    isWorksheet
      ? ["Rader att räkna", String(t.lineCount)]
      : ["Utgående lager", `${nf(t.countedQty)} kg`],
    isWorksheet ? ["Ansvarig", data.openedBy || "____________"] : ["Beräknad försäljning", `${nf(t.sold)} kg`],
    isWorksheet
      ? ["Räknad av", "____________"]
      : ["Differens", `${nf(t.diffKg)} kg / ${nf(t.diffValue, 0)} ${cur}`],
  ];
  const colW = innerWidth / cells.length;
  cells.forEach(([label, value], i) => {
    const x = margin + i * colW + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), x, boxY + 5.5);
    doc.setFontSize(9.5);
    doc.setTextColor(0);
    doc.text(value, x, boxY + 11.5);
    if (i > 0) doc.line(margin + i * colW, boxY, margin + i * colW, boxY + boxH);
  });

  // Tabell — grupperad per kategori
  const groups = new Map<string, DailySheetLine[]>();
  data.lines.forEach((l) => {
    const c = l.category || "Övrigt";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(l);
  });

  const head = isWorksheet
    ? [["#", "Produkt", "Ing. lager kg", "Inlev. kg", "Övrigt kg", "Räknat kg", "Kontr.", "Orsak / kommentar"]]
    : [
        ["#", "Produkt", "Ing. kg", "Inlev. kg", "Övrigt kg", "Sålt kassa", "Förväntat", "Räknat", "Diff kg", `Diff ${cur}`, "Orsak"],
      ];

  const body: any[] = [];
  let n = 0;
  [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "sv"))
    .forEach(([cat, lines]) => {
      const span = isWorksheet ? 8 : 11;
      body.push([
        {
          content: cat.toUpperCase(),
          colSpan: span,
          styles: { fontStyle: "bold", fillColor: [232, 238, 248] },
        },
      ]);
      lines.forEach((l) => {
        n += 1;
        if (isWorksheet) {
          body.push([
            String(n),
            l.productName,
            nf(l.opening),
            nf(l.received),
            l.other ? nf(l.other) : "",
            "",
            "",
            "",
          ]);
        } else {
          const d = diffOf(l);
          const dv = diffValueOf(l);
          body.push([
            String(n),
            l.productName,
            nf(l.opening),
            nf(l.received),
            l.other ? nf(l.other) : "–",
            l.salesBooked ? nf(l.salesBooked) : "–",
            nf(expectedOf(l)),
            l.counted === null ? "–" : nf(l.counted),
            d === null ? "–" : nf(d),
            dv === null ? "–" : nf(dv, 0),
            [l.reason ? REASON_LABEL[l.reason] || l.reason : "", l.note || ""].filter(Boolean).join(" · "),
          ]);
        }
      });
    });

  if (!isWorksheet) {
    body.push([
      { content: "TOTALT", colSpan: 2, styles: { fontStyle: "bold", fillColor: [222, 222, 222] } },
      ...[
        nf(t.opening),
        nf(t.received),
        nf(t.other),
        nf(t.salesBooked),
        "",
        nf(t.countedQty),
        nf(t.diffKg),
        nf(t.diffValue, 0),
        `Lagervärde ${nf(t.closingValue, 0)} ${cur}`,
      ].map((content) => ({
        content,
        styles: { fontStyle: "bold", fillColor: [222, 222, 222], halign: "right" },
      })),
    ]);
  }

  autoTable(doc, {
    startY: boxY + boxH + 4,
    head,
    body,
    theme: "grid",
    styles: {
      fontSize: isWorksheet ? 8.5 : 7.8,
      cellPadding: isWorksheet ? 2.4 : 1.6,
      lineColor: [190, 190, 190],
      lineWidth: 0.2,
      minCellHeight: isWorksheet ? 7 : 0,
      valign: "middle",
    },
    headStyles: { fillColor: [20, 50, 130], textColor: 255, fontStyle: "bold", fontSize: 7.8 },
    columnStyles: isWorksheet
      ? {
          0: { cellWidth: 9, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 24, halign: "right" },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 22, halign: "right" },
          5: { cellWidth: 28, fillColor: [255, 251, 235] },
          6: { cellWidth: 14, fillColor: [255, 251, 235] },
          7: { cellWidth: 62 },
        }
      : {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 18, halign: "right" },
          3: { cellWidth: 19, halign: "right" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 20, halign: "right" },
          7: { cellWidth: 18, halign: "right" },
          8: { cellWidth: 17, halign: "right" },
          9: { cellWidth: 19, halign: "right" },
          10: { cellWidth: 48 },
        },
    margin: { left: margin, right: margin, bottom: 22 },
  });

  let y = ((doc as any).lastAutoTable?.finalY || boxY + boxH + 4) + 6;

  if (isWorksheet) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SÅ FYLLER DU I:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(70);
    doc.text(
      "Ingående lager och inlevererat är redan ifyllt från systemet. Räkna varje rad vid stängning, skriv siffran i RÄKNAT och bocka KONTR. " +
        "Ange orsak om siffran avviker tydligt. Knappa därefter in siffrorna i portalen och godkänn dagen.",
      margin,
      y + 4,
      { maxWidth: innerWidth },
    );
    doc.setTextColor(0);
    y += 12;
  } else if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("NOTERINGAR:", margin, y);
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(data.notes, innerWidth);
    doc.text(split, margin, y + 4.5);
    y += 5 + split.length * 4;
  }

  // Signaturrader
  const sy = Math.max(y + 4, pageHeight - 18);
  doc.setDrawColor(150);
  doc.line(margin, sy, margin + 60, sy);
  doc.line(margin + 75, sy, margin + 135, sy);
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(`Räknad av${data.closedBy ? `: ${data.closedBy}` : ""}`, margin, sy + 4);
  doc.text("Godkänd av", margin + 75, sy + 4);
  doc.text(
    `Utskriven: ${new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`,
    pageWidth - margin,
    sy + 4,
    { align: "right" },
  );
  doc.setTextColor(0);

  return doc;
}

export function generateDailySheetPdf(data: DailySheetPdfData, fileName?: string) {
  const doc = buildDailySheetDoc(data);
  doc.save(
    fileName ||
      `Dagsavstamning-${(data.locationName || "lager").replace(/[^\w\d-]+/g, "_")}-${data.sheetDate}${
        data.variant === "arbetsblad" ? "-arbetsblad" : ""
      }.pdf`,
  );
}
