import { useSite } from "@/contexts/SiteContext";
import ShopOrders from "./ShopOrders";
import WholesaleOrders from "./WholesaleOrders";

export default function OrdersRouter() {
  const { site } = useSite();
  return site === "shop" ? <ShopOrders /> : <WholesaleOrders />;
}
