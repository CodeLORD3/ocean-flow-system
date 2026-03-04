import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import ShopOrders from "./pages/ShopOrders";
import Receiving from "./pages/Receiving";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Stores from "./pages/Stores";
import Staff from "./pages/Staff";
import Wholesale from "./pages/Wholesale";
import Barcodes from "./pages/Barcodes";
import Products from "./pages/Products";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SiteProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/orders" element={<ShopOrders />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/stores" element={<Stores />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/wholesale" element={<Wholesale />} />
              <Route path="/reports" element={<PlaceholderPage title="Rapporter & Analys" />} />
              <Route path="/finance" element={<PlaceholderPage title="Ekonomi" />} />
              <Route path="/forecasts" element={<PlaceholderPage title="Prognoser" />} />
              <Route path="/invoices" element={<PlaceholderPage title="Fakturor" />} />
              <Route path="/receiving" element={<Receiving />} />
              <Route path="/products" element={<Products />} />
              <Route path="/barcodes" element={<Barcodes />} />
              <Route path="/audit" element={<PlaceholderPage title="Revision & Logg" />} />
              <Route path="/settings" element={<PlaceholderPage title="Systeminställningar" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </SiteProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
