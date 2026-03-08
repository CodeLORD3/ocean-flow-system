import { useSite } from "@/contexts/SiteContext";
import ShopReportsPage from "./ShopReports";
import PurchaseReportsArchive from "./PurchaseReportsArchive";

export default function ReportsRouter() {
  const { site } = useSite();

  if (site === "purchasing") {
    return <PurchaseReportsArchive />;
  }

  return <ShopReportsPage />;
}
