import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Search, Briefcase, FileText, Archive, LogOut, X, Bell, User, ChevronRight, Info, BookOpen } from "lucide-react";
import PortalOnboarding from "./PortalOnboarding";
import PortalWelcome from "./PortalWelcome";
import { PortalTabsProvider, usePortalTabs } from "./PortalTabsContext";
import PortalDashboard from "./PortalDashboard";
import PortalOpportunities from "./PortalOpportunities";
import PortalPortfolio from "./PortalPortfolio";
import PortalCommitments from "./PortalCommitments";
import PortalDocuments from "./PortalDocuments";
import PortalArchive from "./PortalArchive";
import PortalOfferDetail from "./PortalOfferDetail";
import PortalAbout from "./PortalAbout";
import PortalHowItWorks from "./PortalHowItWorks";

function PortalTabBar() {
  const { tabs, activeTab, switchTab, closeTab } = usePortalTabs();

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-0 border-b border-border bg-muted/40 px-3 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            className={`group flex items-center gap-2 px-4 py-2 text-xs cursor-pointer border-r border-border transition-colors shrink-0 ${
              isActive
                ? "bg-white text-primary font-semibold border-b-2 border-b-primary"
                : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
            }`}
            onClick={() => switchTab(tab.path)}
          >
            <span className="truncate max-w-[160px]">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortalKeepAlive() {
  const { tabs, activeTab } = usePortalTabs();

  const renderedTabs = useMemo(() => {
    return tabs.map((tab) => {
      let component: React.ReactNode = null;
      if (tab.path === "/portal") component = <PortalDashboard />;
      else if (tab.path === "/portal/opportunities") component = <PortalOpportunities />;
      else if (tab.path === "/portal/portfolio") component = <PortalPortfolio />;
      else if (tab.path === "/portal/commitments") component = <PortalCommitments />;
      else if (tab.path === "/portal/documents") component = <PortalDocuments />;
      else if (tab.path === "/portal/archive") component = <PortalArchive />;
      else if (tab.path === "/portal/about") component = <PortalAbout />;
      else if (tab.path === "/portal/how-it-works") component = <PortalHowItWorks />;
      else if (tab.path.startsWith("/portal/offer/")) {
        const offerId = tab.path.replace("/portal/offer/", "");
        component = <PortalOfferDetail key={tab.path} overrideId={offerId} />;
      }
      if (!component) return null;
      return (
        <div key={tab.path} className="h-full w-full" style={{ display: tab.path === activeTab ? "block" : "none" }}>
          {component}
        </div>
      );
    });
  }, [tabs, activeTab]);

  return <>{renderedTabs}</>;
}

function PortalInner() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();
  const { switchTab, activeTab } = usePortalTabs();

  useEffect(() => {
    setUser({ id: "dev-user", email: "dev@localhost" } as any);
    setLoading(false);
    setProfileStatus("approved");
    setProfileLoading(false);
    const hasSeenWelcome = localStorage.getItem("portal-welcome-seen");
    if (!hasSeenWelcome) setShowWelcome(true);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  const handleWelcomeComplete = () => {
    localStorage.setItem("portal-welcome-seen", "true");
    setShowWelcome(false);
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary text-sm animate-pulse">Loading your account...</div>
      </div>
    );
  }

  if (!user) return null;

  if (profileStatus === null) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-white">
          <span className="text-primary font-bold text-sm tracking-wide">Ocean Trade</span>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <PortalOnboarding userId={user.id} onComplete={() => setProfileStatus("pending")} />
        </main>
      </div>
    );
  }

  if (profileStatus === "pending") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-white">
          <span className="text-primary font-bold text-sm tracking-wide">Ocean Trade</span>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="border border-border bg-white p-10 max-w-md text-center space-y-4">
            <div className="text-warning text-4xl">⏳</div>
            <h2 className="text-foreground text-lg font-bold">Application Under Review</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your application is being reviewed by our team.<br />
              This usually takes <strong>1–3 business days</strong>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (profileStatus === "rejected") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-white">
          <span className="text-primary font-bold text-sm tracking-wide">Ocean Trade</span>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="border border-destructive/30 bg-white p-10 max-w-md text-center space-y-4">
            <div className="text-destructive text-4xl">✕</div>
            <h2 className="text-destructive text-lg font-bold">Application Not Approved</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Unfortunately your application was not approved. Please contact support for more information.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const navItems = [
    { to: "/portal", icon: LayoutDashboard, label: "Overview" },
    { to: "/portal/opportunities", icon: Search, label: "Opportunities" },
    { to: "/portal/portfolio", icon: Briefcase, label: "My Investments" },
    { to: "/portal/documents", icon: FileText, label: "Documents" },
    { to: "/portal/archive", icon: Archive, label: "Archive" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar — clean bank header */}
      <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-white shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">OT</span>
            </div>
            <span className="text-foreground font-bold text-sm">Ocean Trade</span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.to;
              return (
                <button
                  key={item.to}
                  onClick={() => switchTab(item.to)}
                  className={`flex items-center gap-2 px-4 py-2 text-[13px] rounded-sm transition-colors ${
                    isActive
                      ? "text-primary bg-primary/5 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-1.5 text-muted-foreground hover:text-primary transition-colors">
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center rounded-full">
              0
            </span>
          </button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <PortalTabBar />

      <main className="flex-1 overflow-auto p-6 max-w-[1400px] mx-auto w-full">
        {showWelcome ? (
          <PortalWelcome onComplete={handleWelcomeComplete} />
        ) : (
          <PortalKeepAlive />
        )}
      </main>

      <footer className="h-8 flex items-center justify-between border-t border-border px-6 text-[10px] text-muted-foreground bg-white">
        <span>Ocean Trade Platform</span>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>System Online</span>
        </div>
      </footer>
    </div>
  );
}

export default function PortalLayout() {
  return (
    <PortalTabsProvider>
      <PortalInner />
    </PortalTabsProvider>
  );
}
