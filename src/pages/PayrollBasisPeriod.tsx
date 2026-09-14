import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  IndustryButton,
  IndustryFrame,
  IndustryRow,
  SectionLabel,
  StatusLabel,
  DecisionBar,
  DecisionMetric,
} from "@/components/industry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import { usePayrollBasis, type PayrollBasisRow } from "@/hooks/usePayrollBasis";
import {
  PERIOD_SOURCE_LABEL,
  periodBounds,
  periodLabel,
  periodSource,
  recentPeriods,
} from "@/lib/payrollPeriod";

const num = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Löneunderlag per period (16:e–15:e) — reservväg för lönekörningen och facit
 * vid granskning. Exporteras till Excel, formaterad för manuell inmatning i
 * Fortnox Lön: en rad per person med anställningsnummer, timmar och OB.
 */
export default function PayrollBasisPeriod() {
  const periods = useMemo(() => recentPeriods(12), []);
  const { data: entities = [] } = useLegalEntities();
  const [entityId, setEntityId] = useState<string>("");
  const [period, setPeriod] = useState<string>(periods[0]);

  const entity = entities.find((e) => e.legal_entity_id === entityId);
  const { data: rows = [], isLoading } = usePayrollBasis(entityId || null, period);
  const bounds = periodBounds(period);
  const source = periodSource(period);

  const total = (key: keyof PayrollBasisRow) =>
    rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const unattested = rows.reduce((s, r) => s + r.unattested_days, 0);

  const exportExcel = () => {
    if (!rows.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        Anställningsnummer: r.employment_number ?? "",
        Namn: r.full_name,
        Enhet: r.store_name ?? "",
        Avlöningsform: r.pay_type ?? "",
        "Arbetade timmar": Number(r.worked_hours),
        "OB 50": Number(r.ob50_hours),
        "OB 70": Number(r.ob70_hours),
        "OB 100": Number(r.ob100_hours),
        Mertid: Number(r.mertid_hours),
        Övertid: Number(r.overtime_hours),
        "Frånvarodagar": Number(r.absence_days),
        "Frånvarotimmar": Number(r.absence_hours),
        "Oattesterade dagar": r.unattested_days,
      })),
    );
    sheet["!cols"] = [
      { wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 14 },
      { wch: 15 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Löneunderlag");
    const info = XLSX.utils.aoa_to_sheet([
      ["Bolag", entity?.legal_name ?? entityId],
      ["Löneperiod", `${bounds.from} – ${bounds.to}`],
      ["Källa", PERIOD_SOURCE_LABEL[source]],
      ["Antal personer", rows.length],
      ["Oattesterade dagar", unattested],
      ["Skapad", new Date().toLocaleString("sv-SE")],
    ]);
    XLSX.utils.book_append_sheet(book, info, "Period");
    XLSX.writeFile(book, `loneunderlag-${entityId}-${bounds.from}_${bounds.to}.xlsx`);
    toast.success("Excel-filen är nedladdad");
  };

  return (
    <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
      <div>
        <SectionLabel>Lön · Reservväg</SectionLabel>
        <h1 className="ind-h1">Löneunderlag per period</h1>
        <p className="ind-muted mt-1 text-sm">
          Löneperioderna löper 16:e till 15:e. Rapporten är facit vid granskning och fallback om den
          automatiska Fortnox-exporten inte hunnit verifieras.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <SectionLabel>Bolag</SectionLabel>
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger><SelectValue placeholder="Välj bolag" /></SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.legal_entity_id} value={e.legal_entity_id}>{e.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <SectionLabel>Löneperiod</SectionLabel>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {periodLabel(p)} · {PERIOD_SOURCE_LABEL[periodSource(p)]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <IndustryButton variant="primary" corners disabled={!rows.length} onClick={exportExcel}>
          <Download className="h-4 w-4" />
          Excel
        </IndustryButton>
      </div>

      {source === "personalkollen" && (
        <IndustryRow edge="alert" className="flex-wrap gap-3">
          <StatusLabel tone="alert">Personalkollen</StatusLabel>
          <span className="text-sm">
            Perioden {periodLabel(period)} har Personalkollen som källa och beräknas aldrig av oss.
            Rapporten visas som granskningsunderlag.
          </span>
        </IndustryRow>
      )}

      <DecisionBar>
        <DecisionMetric label="Personer" value={String(rows.length)} />
        <DecisionMetric label="Arbetade timmar" value={num(total("worked_hours"))} />
        <DecisionMetric label="OB-timmar" value={num(total("ob50_hours") + total("ob70_hours") + total("ob100_hours"))} />
        <DecisionMetric label="Frånvarodagar" value={num(total("absence_days"))} />
        <DecisionMetric label="Oattesterade dagar" value={String(unattested)} tone={unattested > 0 ? "alert" : "ok"} />
      </DecisionBar>

      <section className="space-y-1">
        <SectionLabel>{periodLabel(period)}</SectionLabel>
        {!entityId ? (
          <IndustryRow edge="neutral"><span className="ind-muted text-sm">Välj bolag för att se underlaget.</span></IndustryRow>
        ) : isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin ind-muted" />
        ) : rows.length === 0 ? (
          <IndustryRow edge="neutral"><span className="ind-muted text-sm">Ingen tid i perioden.</span></IndustryRow>
        ) : (
          rows.map((r) => (
            <IndustryRow key={r.employment_id} edge={r.unattested_days > 0 ? "alert" : "accent"} className="flex-wrap gap-3">
              <span className="ind-mono w-[80px]">{r.employment_number ?? "–"}</span>
              <span className="min-w-[200px] flex-1 font-medium">{r.full_name}</span>
              <span className="ind-mono text-sm">{num(r.worked_hours)} h</span>
              <span className="ind-mono text-sm">OB50 {num(r.ob50_hours)}</span>
              <span className="ind-mono text-sm">OB70 {num(r.ob70_hours)}</span>
              <span className="ind-mono text-sm">OB100 {num(r.ob100_hours)}</span>
              <span className="ind-mono text-sm">Frånvaro {num(r.absence_days)} d</span>
              {r.unattested_days > 0 && <StatusLabel tone="alert">{r.unattested_days} oattesterade</StatusLabel>}
            </IndustryRow>
          ))
        )}
      </section>
    </IndustryFrame>
  );
}
