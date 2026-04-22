// App entry point
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ScrollToTop from "@/components/ScrollToTop";
import { AppLayout } from "@/components/AppLayout";
import { SiteProvider } from "@/contexts/SiteContext";
import { ActiveUserProvider } from "@/contexts/ActiveUserContext";
import { TabsProvider } from "@/contexts/TabsContext";
import { KeepAliveTabs } from "@/components/KeepAliveTabs";
import { StaffAuthProvider, useStaffAuth } from "@/contexts/StaffAuthContext";
import Landing from "@/pages/Landing";
import PortalChooser from "@/pages/PortalChooser";
import FirstLoginPasswordChange from "@/pages/FirstLoginPasswordChange";
import { Loader2 } from "lucide-react";

// Investor Portal
import PortalLayout from "@/portal/PortalLayout";
import PortalLogin from "@/portal/PortalLogin";
import PortalSignup from "@/portal/PortalSignup";
import PortalConfirmEmail from "@/portal/PortalConfirmEmail";
import PortalForgotPassword from "@/portal/PortalForgotPassword";
import PortalResetPassword from "@/portal/PortalResetPassword";

// POS (Point of Sale)
import PosLayout from "@/pos/PosLayout";
import PosGate from "@/pos/PosGate";
import PosLogin from "@/pos/pages/PosLogin";
import PosShift from "@/pos/pages/PosShift";
import PosRegister from "@/pos/pages/PosRegister";

const queryClient = new QueryClient();

const ERPGate = () => {
  const { session, staff, loading } = useStaffAuth();
  const location = useLocation();

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
  if (staff.must_change_password) {
    return <FirstLoginPasswordChange />;
  }
  // Mark current path as the post-login destination
  if (location.pathname === "/") return <Navigate to="/choose-portal" replace />;

  return (
    <ActiveUserProvider>
      <TabsProvider>
        <AppLayout>
          <KeepAliveTabs />
        </AppLayout>
      </TabsProvider>
    </ActiveUserProvider>
  );
};

const AppContent = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <StaffAuthProvider>
        <SiteProvider>
          <Routes>
            {/* Public landing with login (root) */}
            <Route path="/" element={<Landing />} />
            <Route path="/choose-portal" element={<PortalChooser />} />

            {/* Investor Portal (separate auth) */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/signup" element={<PortalSignup />} />
            <Route path="/portal/confirm-email" element={<PortalConfirmEmail />} />
            <Route path="/portal/forgot-password" element={<PortalForgotPassword />} />
            <Route path="/portal/reset-password" element={<PortalResetPassword />} />
            <Route path="/portal/*" element={<PortalLayout />} />

            {/* POS — separate auth, scoped theme */}
            <Route path="/pos" element={<PosLayout />}>
              <Route path="login" element={<PosLogin />} />
              <Route
                path="shift"
                element={
                  <PosGate>
                    <PosShift />
                  </PosGate>
                }
              />
              <Route
                index
                element={
                  <PosGate requireShift>
                    <PosRegister />
                  </PosGate>
                }
              />
            </Route>

            {/* Everything else = ERP (gated) */}
            <Route path="*" element={<ERPGate />} />
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
