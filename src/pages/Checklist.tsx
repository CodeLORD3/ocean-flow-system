import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Loader2, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSite } from "@/contexts/SiteContext";
import { ChecklistTable } from "@/components/checklist/ChecklistTable";
import {
  useChecklistDayItems,
  useChecklistReports,
  useDailyChecklist,
  weekdayName,
} from "@/hooks/useChecklist";

function ShopChecklist({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { data, isLoading } = useDailyChecklist(storeId);

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar dagens checklista…
      </div>
    );
  }

  return (
    <ChecklistTable
      day={data.day}
      items={data.items}
      title={`Checklista – ${weekdayName(data.day.checklist_date)} ${data.day.checklist_date}`}
    />
  );
}

function ChecklistReportDetail({ dayId, onBack }: { dayId: string; onBack: () => void }) {
  const { data: reports = [] } = useChecklistReports();
  const { data: items = [], isLoading } = useChecklistDayItems(dayId);
  const day = reports.find((r: any) => r.id === dayId);

  if (isLoading || !day) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar rapport…
      </div>
    );
  }

  return (
    <ChecklistTable
      day={day}
      items={items}
      readOnly
      onBack={onBack}
      title={`${day.storeName} – ${weekdayName(day.checklist_date)} ${day.checklist_date}`}
    />
  );
}

function ChecklistReports() {
  const { data: reports = [], isLoading } = useChecklistReports();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) return <ChecklistReportDetail dayId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" /> Checklistor
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dagliga checklistor från butikerna — slutförda listor sparas som rapporter.
        </p>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading">Rapporter</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Laddar…</p>
          ) : reports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga checklistor har rapporterats in ännu.</p>
          ) : (
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left font-semibold py-2">Datum</th>
                  <th className="text-left font-semibold py-2 hidden md:table-cell">Veckodag</th>
                  <th className="text-left font-semibold py-2">Butik</th>
                  <th className="text-left font-semibold py-2 hidden md:table-cell">Ansvarig</th>
                  <th className="text-center font-semibold py-2 w-14">Klara</th>
                  <th className="text-left font-semibold py-2 hidden sm:table-cell">Status</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 font-mono tabular-nums text-[11px] sm:text-xs">{r.checklist_date}</td>
                    <td className="py-2 text-xs text-muted-foreground hidden md:table-cell">{weekdayName(r.checklist_date)}</td>
                    <td className="py-2 text-xs sm:text-sm truncate pr-2">{r.storeName}</td>
                    <td className="py-2 text-xs text-muted-foreground hidden md:table-cell">{r.responsible_name || "–"}</td>
                    <td className="py-2 text-center font-mono tabular-nums text-[11px] sm:text-xs">
                      {r.doneCount}/{r.total}
                    </td>
                    <td className="py-2 hidden sm:table-cell">
                      {r.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Slutförd
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Clock className="h-3 w-3" /> Pågående
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => setOpenId(r.id)}>
                        Visa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Checklist() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const isShop = site === "shop" && !!activeStoreId;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {isShop ? (
        <ShopChecklist storeId={activeStoreId!} storeName={activeStoreName || "Butik"} />
      ) : (
        <ChecklistReports />
      )}
    </motion.div>
  );
}
