import { useSite } from "@/contexts/SiteContext";
import ShopReportsPage from "./ShopReports";
import PurchaseReportsArchive from "./PurchaseReportsArchive";
import ProductionReportsArchive from "./ProductionReportsArchive";

export default function ReportsRouter() {
  const { site } = useSite();

  if (site === "wholesale") {
    return <PurchaseReportsArchive />;
  }
  
  if (site === "production") {
    return <ProductionReportsArchive />;
  }

  return <ShopReportsPage />;
}
