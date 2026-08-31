/**
 * Export av veckorapporter: PDF (utskrift) och Excel.
 * Delas av vecko- och dagsnivå på /reports.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export type ReportRow = {
  label: string;
  total_sales_sek: number | null;
  avg_sales_per_day_sek: number | null;
  staff_hours: number;
  staff_shifts: number;
  reports: string;
  status: string;
};

export type DayRow = {
  date: string;
  weekday: string;
  gross_sales: number | null;
  net_sales: number | null;
  receipt_count: number | null;
  staff_hours: number;
  staff_shifts: number;
  comment?: string | null;
  weather?: string | null;
};

export interface WeeklyExportPayload {
  title: string;
  subtitle: string;
  rows: ReportRow[];
  days?: { storeLabel: string; rows: DayRow[] }[];
}

const HEAD = ["Enhet", "Nettoomsättning (kr)", "Netto snitt/dag (kr)", "Timmar", "Personpass", "Dagsrapporter", "Status"];
const DAY_HEAD = ["Datum", "Dag", "Brutto (kr)", "Netto (kr)", "Väder", "Kvitton", "Timmar", "Pass"];

export function weeklyReportPdf(payload: WeeklyExportPayload) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(payload.title, 14, 16);
  doc.setFontSize(10);
  doc.text(payload.subtitle, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [HEAD],
    body: payload.rows.map((r) => [
      r.label,
      r.total_sales_sek == null ? "—" : int.format(r.total_sales_sek),
      r.avg_sales_per_day_sek == null ? "—" : int.format(r.avg_sales_per_day_sek),
      dec.format(r.staff_hours),
      int.format(r.staff_shifts),
      r.reports,
      r.status,
    ]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  (payload.days ?? []).forEach((group) => {
    const prev = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 28;
    autoTable(doc, {
      startY: prev + 8,
      head: [[`Dag för dag · ${group.storeLabel}`, "", "", "", "", "", "", ""], DAY_HEAD],
      body: group.rows.map((d) => [
        d.date,
        d.weekday,
        d.gross_sales == null ? "—" : int.format(d.gross_sales),
        d.net_sales == null ? "—" : int.format(d.net_sales),
        d.weather ?? "—",
        d.receipt_count == null ? "—" : int.format(d.receipt_count),
        dec.format(d.staff_hours),
        int.format(d.staff_shifts),
      ]),
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  });

  doc.save(`${payload.title.replace(/[^\w-]+/g, "_")}.pdf`);
}

export function weeklyReportXlsx(payload: WeeklyExportPayload) {
  const wb = XLSX.utils.book_new();
  const summary = [
    [payload.title],
    [payload.subtitle],
    [],
    HEAD,
    ...payload.rows.map((r) => [
      r.label,
      r.total_sales_sek ?? null,
      r.avg_sales_per_day_sek ?? null,
      r.staff_hours,
      r.staff_shifts,
      r.reports,
      r.status,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Sammanställning");

  (payload.days ?? []).forEach((group, i) => {
    const aoa = [
      [group.storeLabel],
      [],
      DAY_HEAD,
      ...group.rows.map((d) => [
        d.date,
        d.weekday,
        d.gross_sales ?? null,
        d.net_sales ?? null,
        d.weather ?? "—",
        d.receipt_count ?? null,
        d.staff_hours,
        d.staff_shifts,
      ]),
    ];
    const name = (group.storeLabel || `Dagar ${i + 1}`).slice(0, 28).replace(/[\\/?*[\]:]/g, " ");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  });

  XLSX.writeFile(wb, `${payload.title.replace(/[^\w-]+/g, "_")}.xlsx`);
}
