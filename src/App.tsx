import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import { ActiveUserProvider } from "@/contexts/ActiveUserContext";
import { TabsProvider } from "@/contexts/TabsContext";
import { KeepAliveTabs } from "@/components/KeepAliveTabs";

const queryClient = new QueryClient();

const AppContent = () => {
  return (
    <BrowserRouter>
      <SiteProvider>
        <ActiveUserProvider>
        <TabsProvider>
          <AppLayout>
            <KeepAliveTabs />
          </AppLayout>
        </TabsProvider>
        </ActiveUserProvider>
      </SiteProvider>
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
