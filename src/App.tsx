import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./pages/Login";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import OrdersRouter from "./pages/OrdersRouter";
import Receiving from "./pages/Receiving";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Stores from "./pages/Stores";
import Staff from "./pages/Staff";
import Barcodes from "./pages/Barcodes";
import Products from "./pages/Products";
import OrganisationOverview from "./pages/OrganisationOverview";
import PlaceholderPage from "./pages/PlaceholderPage";
import PurchaseReporting from "./pages/PurchaseReporting";
import Pricing from "./pages/Pricing";
import ShopReports from "./pages/ShopReports";
import PurchaseSchedule from "./pages/PurchaseSchedule";
import ProductionSchedule from "./pages/ProductionSchedule";
import ProductionReporting from "./pages/ProductionReporting";
import ReportsRouter from "./pages/ReportsRouter";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  return (
    <BrowserRouter>
      <SiteProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/orders" element={<OrdersRouter />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/organisation" element={<OrganisationOverview />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/reports" element={<ReportsRouter />} />
            <Route path="/finance" element={<PlaceholderPage title="Ekonomi" />} />
            <Route path="/forecasts" element={<PlaceholderPage title="Prognoser" />} />
            <Route path="/invoices" element={<PlaceholderPage title="Fakturor" />} />
            <Route path="/purchase-reporting" element={<PurchaseReporting />} />
            <Route path="/receiving" element={<Receiving />} />
            <Route path="/products" element={<Products />} />
            <Route path="/barcodes" element={<Barcodes />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/purchase-schedule" element={<PurchaseSchedule />} />
            <Route path="/production-schedule" element={<ProductionSchedule />} />
            <Route path="/production-reporting" element={<ProductionReporting />} />
            <Route path="/audit" element={<PlaceholderPage title="Revision & Logg" />} />
            <Route path="/settings" element={<PlaceholderPage title="Systeminställningar" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </SiteProvider>
    </BrowserRouter>
  );
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Clear localStorage to test login - remove this line later
    localStorage.removeItem("app_authenticated");
    
    const auth = localStorage.getItem("app_authenticated");
    if (auth === "true") {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogin = () => {
    localStorage.setItem("app_authenticated", "true");
    setIsAuthenticated(true);
  };

  if (isAuthenticated === null) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!isAuthenticated ? <Login onLogin={handleLogin} /> : <AppContent />}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
