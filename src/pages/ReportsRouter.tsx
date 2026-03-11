import { useSite } from "@/contexts/SiteContext";
import ShopReportsPage from "./ShopReports";
import PurchaseReportsArchive from "./PurchaseReportsArchive";
import ProductionReportsArchive from "./ProductionReportsArchive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, FileText, Factory } from "lucide-react";
import { useState } from "react";

function WholesaleReportsPage() {
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Rapporter</h2>

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
