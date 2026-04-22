// App entry point
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "@/components/ScrollToTop";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import { ActiveUserProvider } from "@/contexts/ActiveUserContext";
import { TabsProvider } from "@/contexts/TabsContext";
import { KeepAliveTabs } from "@/components/KeepAliveTabs";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import Landing from "@/pages/Landing";
import PortalChooser from "@/pages/PortalChooser";
import { Loader2 } from "lucide-react";

// Portal imports (Investor portal)
import PortalLayout from "@/portal/PortalLayout";
import PortalLogin from "@/portal/PortalLogin";
import PortalSignup from "@/portal/PortalSignup";
import PortalConfirmEmail from "@/portal/PortalConfirmEmail";
import PortalForgotPassword from "@/portal/PortalForgotPassword";
import PortalResetPassword from "@/portal/PortalResetPassword";

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

const RequireStaffAuth = ({ children }: { children: React.ReactNode }) => {
  const { session, staff, loading } = useStaffAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/" replace />;
  if (!staff || (staff.portal_access ?? []).length === 0) {
    return <Navigate to="/choose-portal" replace />;
  }
  return <>{children}</>;
};

const AppContent = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <StaffAuthProvider>
        <SiteProvider>
          <Routes>
            {/* Public landing with login */}
            <Route path="/" element={<Landing />} />
            <Route path="/choose-portal" element={<PortalChooser />} />

            {/* Investor Portal (separate auth) */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/signup" element={<PortalSignup />} />
            <Route path="/portal/confirm-email" element={<PortalConfirmEmail />} />
            <Route path="/portal/forgot-password" element={<PortalForgotPassword />} />
            <Route path="/portal/reset-password" element={<PortalResetPassword />} />
            <Route path="/portal/*" element={<PortalLayout />} />

            {/* ERP — gated */}
            <Route
              path="/app/*"
              element={
                <RequireStaffAuth>
                  <ActiveUserProvider>
                    <TabsProvider>
                      <AppLayout>
                        <KeepAliveTabs />
                      </AppLayout>
                    </TabsProvider>
                  </ActiveUserProvider>
                </RequireStaffAuth>
              }
            />

            {/* Catch-all sends back to landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SiteProvider>
      </StaffAuthProvider>
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
