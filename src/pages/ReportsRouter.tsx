import { useSite } from "@/contexts/SiteContext";
import ShopReportsPage from "./ShopReports";
import PurchaseReportsArchive from "./PurchaseReportsArchive";
import ProductionReportsArchive from "./ProductionReportsArchive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, FileText, Factory, Receipt, CalendarRange, CalendarDays } from "lucide-react";
import { DailyReportsArchive } from "@/components/dashboard/DailyReportsArchive";
import { WeeklyStoreReportsSection } from "@/components/reports/WeeklyStoreReports";
import { MonthlyReportsSection } from "@/components/reports/MonthlyReports";
import { useRealtimeReportUpdates } from "@/hooks/useWeeklyStoreReports";
import { useState } from "react";
import { SectionErrorBoundary } from "@/components/reports/SectionErrorBoundary";

function WholesaleReportsPage() {
  useRealtimeReportUpdates();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Rapporter & analys</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Rapporter</h2>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">Liveuppdaterad</p>
      </div>

      <Card>
        <CardHeader className="p-0">
          <button
            type="button"
            aria-expanded={purchaseOpen}
            onClick={() => setPurchaseOpen(!purchaseOpen)}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
          >
            {purchaseOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Inköpsrapporter</CardTitle>
          </button>
        </CardHeader>
        {purchaseOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <SectionErrorBoundary title="Inköpsrapporter">
              <PurchaseReportsArchive />
            </SectionErrorBoundary>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="p-0">
          <button
            type="button"
            aria-expanded={productionOpen}
            onClick={() => setProductionOpen(!productionOpen)}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
          >
            {productionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Factory className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Produktionsrapporter</CardTitle>
          </button>
        </CardHeader>
        {productionOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <SectionErrorBoundary title="Produktionsrapporter">
              <ProductionReportsArchive />
            </SectionErrorBoundary>
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader className="p-0">
          <button
            type="button"
            aria-expanded={dailyOpen}
            onClick={() => setDailyOpen(!dailyOpen)}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
          >
            {dailyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Receipt className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Dagsrapporter (butiker)</CardTitle>
          </button>
        </CardHeader>
        {dailyOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <SectionErrorBoundary title="Dagsrapporter">
              <DailyReportsArchive />
            </SectionErrorBoundary>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="p-0">
          <button
            type="button"
            aria-expanded={weeklyOpen}
            onClick={() => setWeeklyOpen(!weeklyOpen)}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
          >
            {weeklyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CalendarRange className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Veckorapporter</CardTitle>
          </button>
        </CardHeader>
        {weeklyOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <SectionErrorBoundary title="Veckorapporter">
              <WeeklyStoreReportsSection />
            </SectionErrorBoundary>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="p-0">
          <button
            type="button"
            aria-expanded={monthlyOpen}
            onClick={() => setMonthlyOpen(!monthlyOpen)}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50"
          >
            {monthlyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CalendarDays className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Månadsrapporter</CardTitle>
          </button>
        </CardHeader>
        {monthlyOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <SectionErrorBoundary title="Månadsrapporter">
              <MonthlyReportsSection />
            </SectionErrorBoundary>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function ReportsRouter() {
  const { site } = useSite();

  if (site === "wholesale") {
    return <WholesaleReportsPage />;
  }
  
  if (site === "production") {
    return <ProductionReportsArchive />;
  }

  return <ShopReportsPage />;
}
