import React, { ComponentType, useMemo } from "react";
import { useTabs } from "@/contexts/TabsContext";

// Eagerly import all page components so they stay mounted
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import OrdersRouter from "@/pages/OrdersRouter";
import Receiving from "@/pages/Receiving";
import Suppliers from "@/pages/Suppliers";
import Customers from "@/pages/Customers";
import Stores from "@/pages/Stores";
import Staff from "@/pages/Staff";
import Barcodes from "@/pages/Barcodes";
import Products from "@/pages/Products";
import OrganisationOverview from "@/pages/OrganisationOverview";
import PlaceholderPage from "@/pages/PlaceholderPage";
import Invoices from "@/pages/Invoices";
import PurchaseReporting from "@/pages/PurchaseReporting";
import Pricing from "@/pages/Pricing";
import ShopReports from "@/pages/ShopReports";
import PurchaseSchedule from "@/pages/PurchaseSchedule";
import ProductionSchedule from "@/pages/ProductionSchedule";
import ProductionReporting from "@/pages/ProductionReporting";
import ReportsRouter from "@/pages/ReportsRouter";
import AuditLog from "@/pages/AuditLog";
import TradeOffers from "@/pages/TradeOffers";
import TradeHistory from "@/pages/TradeHistory";
import InvestorPortal from "@/pages/InvestorPortal";
import InvestorList from "@/pages/InvestorList";

interface RouteEntry {
  component: React.ReactNode;
}

const ROUTE_MAP: Record<string, RouteEntry> = {
  "/": { component: <Dashboard /> },
  "/inventory": { component: <Inventory /> },
  "/orders": { component: <OrdersRouter /> },
  "/suppliers": { component: <Suppliers /> },
  "/customers": { component: <Customers /> },
  "/stores": { component: <Stores /> },
  "/organisation": { component: <OrganisationOverview /> },
  "/staff": { component: <Staff /> },
  "/reports": { component: <ReportsRouter /> },
  "/finance": { component: <PlaceholderPage title="Ekonomi" /> },
  "/forecasts": { component: <PlaceholderPage title="Prognoser" /> },
  "/invoices": { component: <Invoices /> },
  "/purchase-reporting": { component: <PurchaseReporting /> },
  "/receiving": { component: <Receiving /> },
  "/products": { component: <Products /> },
  "/barcodes": { component: <Barcodes /> },
  "/pricing": { component: <Pricing /> },
  "/purchase-schedule": { component: <PurchaseSchedule /> },
  "/production-schedule": { component: <ProductionSchedule /> },
  "/production-reporting": { component: <ProductionReporting /> },
  "/audit": { component: <AuditLog /> },
  "/settings": { component: <PlaceholderPage title="Systeminställningar" /> },
  "/trade-offers": { component: <TradeOffers /> },
  "/trade-history": { component: <TradeHistory /> },
  "/investor-portal": { component: <InvestorPortal /> },
};

/**
 * Renders all opened tabs simultaneously, hiding inactive ones with CSS.
 * This preserves component state (open dialogs, scroll position, form data)
 * when switching between tabs.
 */
export function KeepAliveTabs() {
  const { tabs, activeTab } = useTabs();

  return (
    <>
      {tabs.map((tab) => {
        const route = ROUTE_MAP[tab.path];
        if (!route) return null;
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            className="h-full w-full"
            style={{ display: isActive ? "block" : "none" }}
          >
            {route.component}
          </div>
        );
      })}
    </>
  );
}
