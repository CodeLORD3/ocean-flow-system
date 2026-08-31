import { useSite } from "@/contexts/SiteContext";
import ShopReportsPage from "./ShopReports";
import PurchaseReportsArchive from "./PurchaseReportsArchive";
import ProductionReportsArchive from "./ProductionReportsArchive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, FileText, Factory, Receipt, CalendarRange } from "lucide-react";
import { DailyReportsArchive } from "@/components/dashboard/DailyReportsArchive";
import { WeeklyStoreReportsSection } from "@/components/reports/WeeklyStoreReports";
import { useRealtimeReportUpdates } from "@/hooks/useWeeklyStoreReports";
import { useState } from "react";

function WholesaleReportsPage() {
  useRealtimeReportUpdates();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

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
        <CardHeader
          className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4"
          onClick={() => setPurchaseOpen(!purchaseOpen)}
        >
          <div className="flex items-center gap-2">
            {purchaseOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Inköpsrapporter</CardTitle>
          </div>
        </CardHeader>
        {purchaseOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <PurchaseReportsArchive />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4"
          onClick={() => setProductionOpen(!productionOpen)}
        >
          <div className="flex items-center gap-2">
            {productionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Factory className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Produktionsrapporter</CardTitle>
          </div>
        </CardHeader>
        {productionOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <ProductionReportsArchive />
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4"
          onClick={() => setDailyOpen(!dailyOpen)}
        >
          <div className="flex items-center gap-2">
            {dailyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Receipt className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Dagsrapporter (butiker)</CardTitle>
          </div>
        </CardHeader>
        {dailyOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <DailyReportsArchive />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4"
          onClick={() => setWeeklyOpen(!weeklyOpen)}
        >
          <div className="flex items-center gap-2">
            {weeklyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CalendarRange className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Veckorapporter</CardTitle>
          </div>
        </CardHeader>
        {weeklyOpen && (
          <CardContent className="pt-0 px-4 pb-4">
            <WeeklyStoreReportsSection />
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
