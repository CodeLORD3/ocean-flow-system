import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type CurrencyLabel = string;

interface InvLine {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}
interface CostLine { label: string; amount: number; }
interface SalesLine { channel: string; quantity: number; amount: number; last_year_amount?: number; }
interface SocialLine { platform: string; opening_followers: number; closing_followers: number; posts_count: number; }

export interface ShopReportPdfPayload {
  storeName: string;
  city?: string | null;
  year: number;
  week: number;
  weekRange: string;
  status: "draft" | "finalized";
  currency: CurrencyLabel; // display unit, e.g. "kr", "CHF"
  openingInventory: number;
  closingInventory: number;
  inventoryChange: number;
  totalCosts: number;
  totalSales: number;
  grossMargin: number;
  grossMarginPct: number;
  notes?: string;
  inventory: InvLine[];
  costs: CostLine[];
  sales: SalesLine[];
  social: SocialLine[];
}

const fmtNum = (v: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(v || 0);

export function generateShopReportPdf(p: ShopReportPdfPayload) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 10; // margin
  const contentW = pageW - M * 2;
  const cur = p.currency;
  const fmtC = (v: number) => `${fmtNum(v)} ${cur}`;

  // ── Header ─────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Veckorapport — ${p.storeName}${p.city ? `, ${p.city}` : ""}`, M, 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Vecka ${p.week}, ${p.year}  ·  ${p.weekRange}  ·  ${p.status === "finalized" ? "Slutförd" : "Utkast"}`, M, 13.5);
  doc.setFontSize(8);
  doc.text(`Genererad: ${new Date().toLocaleString("sv-SE")}`, pageW - M, 13.5, { align: "right" });

  let y = 22;
  doc.setTextColor(0, 0, 0);

  // ── KPI strip ──────────────────────────────────────────────────────
  const kpis: Array<[string, string, [number, number, number]?]> = [
    ["Försäljning", fmtC(p.totalSales)],
    ["Kostnader", fmtC(p.totalCosts)],
    ["Bruttomarginal", fmtC(p.grossMargin), p.grossMargin >= 0 ? [16, 122, 87] : [185, 28, 28]],
    ["Marginal %", p.grossMarginPct > 0 ? `${p.grossMarginPct.toFixed(1)}%` : "–",
      p.grossMarginPct >= 45 ? [16, 122, 87] : p.grossMarginPct >= 35 ? [161, 98, 7] : p.grossMarginPct > 0 ? [185, 28, 28] : [100, 100, 100]],
    ["Utg. lager", fmtC(p.closingInventory)],
    ["Lagerförändring", `${p.inventoryChange >= 0 ? "+" : ""}${fmtC(p.inventoryChange)}`,
      p.inventoryChange >= 0 ? [16, 122, 87] : [185, 28, 28]],
  ];
  const kpiW = contentW / kpis.length;
  const kpiH = 13;
  kpis.forEach(([label, value, color], i) => {
    const x = M + kpiW * i;
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, kpiW - 1, kpiH, "FD");
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x + 1.5, y + 3.5);
    doc.setTextColor(...(color || [20, 20, 20]) as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(value, x + 1.5, y + 9.5);
  });
  y += kpiH + 3;
  doc.setTextColor(0, 0, 0);

  // ── Two-column layout for tables ───────────────────────────────────
  const colGap = 4;
  const colW = (contentW - colGap) / 2;
  const leftX = M;
  const rightX = M + colW + colGap;

  const sectionTitle = (text: string, x: number, yy: number, w: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(x, yy, w, 4.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(text.toUpperCase(), x + 1.5, yy + 3.2);
    doc.setTextColor(0, 0, 0);
  };

  const tableStyles = {
    fontSize: 7,
    cellPadding: { top: 1, right: 1.5, bottom: 1, left: 1.5 },
    lineColor: [220, 220, 220] as [number, number, number],
    lineWidth: 0.1,
  };
  const headStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: [30, 41, 59] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 6.8,
  };

  // LEFT: Inventory
  let leftY = y;
  sectionTitle(`Inventering — ingående ${fmtC(p.openingInventory)} → utgående ${fmtC(p.closingInventory)}`, leftX, leftY, colW);
  leftY += 5;
  autoTable(doc, {
    startY: leftY,
    margin: { left: leftX, right: pageW - leftX - colW },
    tableWidth: colW,
    styles: tableStyles,
    headStyles,
    head: [["Produkt", "Antal", "Enh.", `Á-pris`, `Totalt`]],
    body: p.inventory.length
      ? p.inventory.map((l) => [
          l.name,
          fmtNum(l.quantity),
          l.unit,
          fmtNum(l.unit_price),
          fmtNum(l.total),
        ])
      : [["—", "", "", "", ""]],
    foot: [[
      { content: "Summa", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
      { content: fmtNum(p.closingInventory), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    footStyles: { fillColor: [248, 250, 252], textColor: [20, 20, 20] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 11 },
      2: { halign: "center", cellWidth: 8 },
      3: { halign: "right", cellWidth: 14 },
      4: { halign: "right", cellWidth: 16 },
    },
  });
  leftY = (doc as any).lastAutoTable.finalY + 2;

  // LEFT: Costs
  sectionTitle("Kostnader", leftX, leftY, colW);
  leftY += 5;
  const costRows = p.costs.filter((c) => c.amount !== 0).map((c) => [c.label || "—", fmtNum(c.amount)]);
  if (p.inventoryChange < 0) costRows.push(["Lagerförändring (neg.)", fmtNum(Math.abs(p.inventoryChange))]);
  autoTable(doc, {
    startY: leftY,
    margin: { left: leftX, right: pageW - leftX - colW },
    tableWidth: colW,
    styles: tableStyles,
    headStyles,
    head: [["Kostnad", `Belopp (${cur})`]],
    body: costRows.length ? costRows : [["—", ""]],
    foot: [[
      { content: "Totala kostnader", styles: { halign: "right", fontStyle: "bold" } },
      { content: fmtNum(p.totalCosts), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    footStyles: { fillColor: [248, 250, 252], textColor: [20, 20, 20] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 22 },
    },
  });
  leftY = (doc as any).lastAutoTable.finalY + 2;

  // RIGHT: Sales
  let rightY = y;
  sectionTitle("Försäljning exkl. moms", rightX, rightY, colW);
  rightY += 5;
  autoTable(doc, {
    startY: rightY,
    margin: { left: rightX, right: M },
    tableWidth: colW,
    styles: tableStyles,
    headStyles,
    head: [["Kanal", "Antal", `Belopp`, `Förra året`, "Δ%"]],
    body: p.sales.length
      ? p.sales.map((l) => {
          const yoy = l.last_year_amount && l.last_year_amount > 0
            ? ((l.amount - l.last_year_amount) / l.last_year_amount) * 100
            : null;
          return [
            l.channel,
            fmtNum(l.quantity),
            fmtNum(l.amount),
            l.last_year_amount ? fmtNum(l.last_year_amount) : "–",
            yoy !== null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(0)}%` : "–",
          ];
        })
      : [["—", "", "", "", ""]],
    foot: [[
      { content: "Total försäljning", colSpan: 2, styles: { halign: "right", fontStyle: "bold" } },
      { content: fmtNum(p.totalSales), styles: { halign: "right", fontStyle: "bold" } },
      { content: "", colSpan: 2 },
    ]],
    footStyles: { fillColor: [248, 250, 252], textColor: [20, 20, 20] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 11 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 18 },
      4: { halign: "right", cellWidth: 12 },
    },
  });
  rightY = (doc as any).lastAutoTable.finalY + 2;

  // RIGHT: Social
  sectionTitle("Sociala medier", rightX, rightY, colW);
  rightY += 5;
  autoTable(doc, {
    startY: rightY,
    margin: { left: rightX, right: M },
    tableWidth: colW,
    styles: tableStyles,
    headStyles,
    head: [["Plattform", "Ing.", "Utg.", "Δ", "Inlägg"]],
    body: p.social.length
      ? p.social.map((l) => {
          const change = l.closing_followers - l.opening_followers;
          return [
            l.platform,
            fmtNum(l.opening_followers),
            fmtNum(l.closing_followers),
            `${change >= 0 ? "+" : ""}${fmtNum(change)}`,
            fmtNum(l.posts_count),
          ];
        })
      : [["—", "", "", "", ""]],
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 14 },
      2: { halign: "right", cellWidth: 14 },
      3: { halign: "right", cellWidth: 12 },
      4: { halign: "right", cellWidth: 12 },
    },
  });
  rightY = (doc as any).lastAutoTable.finalY + 2;

  // ── Notes (full width, below the lower of the two columns) ────────
  let notesY = Math.max(leftY, rightY) + 2;
  if (notesY < pageH - 25) {
    sectionTitle("Veckans noteringar", M, notesY, contentW);
    notesY += 5;
    doc.setDrawColor(220, 220, 220);
    const noteH = Math.min(pageH - notesY - 8, 30);
    doc.rect(M, notesY, contentW, noteH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    const text = (p.notes || "—").trim() || "—";
    const lines = doc.splitTextToSize(text, contentW - 4);
    doc.text(lines.slice(0, Math.floor(noteH / 3.5)), M + 2, notesY + 4);
  }

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `${p.storeName} · Vecka ${p.week}/${p.year} · ${p.status === "finalized" ? "Slutförd" : "Utkast"}`,
    M,
    pageH - 4,
  );
  doc.text("Makrill Trade", pageW - M, pageH - 4, { align: "right" });

  const safeStore = p.storeName.replace(/[^a-z0-9]+/gi, "_");
  doc.save(`Veckorapport_${safeStore}_V${p.week}_${p.year}.pdf`);
}
