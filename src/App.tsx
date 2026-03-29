import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import { ActiveUserProvider } from "@/contexts/ActiveUserContext";
import { TabsProvider } from "@/contexts/TabsContext";
import { KeepAliveTabs } from "@/components/KeepAliveTabs";

// Portal imports
import PortalLayout from "@/portal/PortalLayout";
import PortalLogin from "@/portal/PortalLogin";
import PortalDashboard from "@/portal/PortalDashboard";
import PortalOfferDetail from "@/portal/PortalOfferDetail";
import PortalCommitments from "@/portal/PortalCommitments";
import PortalArchive from "@/portal/PortalArchive";

const queryClient = new QueryClient();

const ERPContent = () => {
  return (
    <SiteProvider>
      <ActiveUserProvider>
        <TabsProvider>
          <AppLayout>
            <KeepAliveTabs />
          </AppLayout>
        </TabsProvider>
      </ActiveUserProvider>
    </SiteProvider>
  );
};

const AppContent = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Client Trading Portal — separate layout with internal tab system */}
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal/*" element={<PortalLayout />} />

        {/* ERP — catch-all */}
        <Route path="*" element={<ERPContent />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
