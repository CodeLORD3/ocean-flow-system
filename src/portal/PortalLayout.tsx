import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BarChart3, Briefcase, History, LogOut, X, Search, FolderOpen, FileText, Bell } from "lucide-react";
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

function PortalTabBar() {
  const { tabs, activeTab, switchTab, closeTab } = usePortalTabs();

  return (
    <div className="flex items-center gap-0 border-b border-[#d0d7e2] bg-[#eef1f5] px-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider cursor-pointer border-r border-[#d0d7e2] transition-colors shrink-0 ${
              isActive
                ? "bg-white text-[#0066ff] font-bold border-b-2 border-b-[#0066ff]"
                : "text-[#6b7a8d] hover:bg-white/60"
            }`}
            onClick={() => switchTab(tab.path)}
          >
            <span className="truncate max-w-[140px]">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-1"
              >
                <X className="h-3 w-3" />
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
      if (tab.path === "/portal") {
        component = <PortalDashboard />;
      } else if (tab.path === "/portal/opportunities") {
        component = <PortalOpportunities />;
      } else if (tab.path === "/portal/portfolio") {
        component = <PortalPortfolio />;
      } else if (tab.path === "/portal/commitments") {
        component = <PortalCommitments />;
      } else if (tab.path === "/portal/documents") {
        component = <PortalDocuments />;
      } else if (tab.path === "/portal/archive") {
        component = <PortalArchive />;
      } else if (tab.path.startsWith("/portal/offer/")) {
        const offerId = tab.path.replace("/portal/offer/", "");
        component = <PortalOfferDetail key={tab.path} overrideId={offerId} />;
      }
      if (!component) return null;
      const isActive = tab.path === activeTab;
      return (
        <div
          key={tab.path}
          className="h-full w-full"
          style={{ display: isActive ? "block" : "none" }}
        >
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
  const { switchTab } = usePortalTabs();

  useEffect(() => {
    // Dev mode: skip auth entirely
    setUser({ id: "dev-user", email: "dev@localhost" } as any);
    setLoading(false);
    setProfileStatus("approved");
    setProfileLoading(false);

    // Check if user has seen the welcome screen
    const hasSeenWelcome = localStorage.getItem("portal-welcome-seen");
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
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
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <div className="text-[#0066ff] font-mono text-sm animate-pulse">LOADING...</div>
      </div>
    );
  }

  if (!user) return null;

  if (profileStatus === null) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] text-[#1a2035] font-mono flex flex-col">
        <header className="h-10 flex items-center justify-between border-b border-[#d0d7e2] px-4 bg-white">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">TRADE PORTAL</span>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[10px] text-[#6b7a8d] hover:text-red-400 transition-colors">
            <LogOut className="h-3 w-3" /> EXIT
          </button>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <PortalOnboarding userId={user.id} onComplete={() => setProfileStatus("pending")} />
        </main>
      </div>
    );
  }

  if (profileStatus === "pending") {
    return (
      <div className="min-h-screen bg-[#f4f6f9] text-[#1a2035] font-mono flex flex-col">
        <header className="h-10 flex items-center justify-between border-b border-[#d0d7e2] px-4 bg-white">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">TRADE PORTAL</span>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[10px] text-[#6b7a8d] hover:text-red-400 transition-colors">
            <LogOut className="h-3 w-3" /> EXIT
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="border border-[#d0d7e2] bg-white p-8 max-w-md text-center space-y-4">
            <div className="text-yellow-400 text-4xl">⏳</div>
            <h2 className="text-[#1a2035] text-lg font-bold tracking-wider">PENDING APPROVAL</h2>
            <p className="text-[#6b7a8d] text-xs leading-relaxed">
              Your application is being reviewed.<br />
              Approval may take up to <span className="text-[#1a2035] font-bold">3 business days</span>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (profileStatus === "rejected") {
    return (
      <div className="min-h-screen bg-[#f4f6f9] text-[#1a2035] font-mono flex flex-col">
        <header className="h-10 flex items-center justify-between border-b border-[#d0d7e2] px-4 bg-white">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">TRADE PORTAL</span>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[10px] text-[#6b7a8d] hover:text-red-400 transition-colors">
            <LogOut className="h-3 w-3" /> EXIT
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="border border-red-600/30 bg-white p-8 max-w-md text-center space-y-4">
            <div className="text-red-400 text-4xl">✕</div>
            <h2 className="text-red-400 text-lg font-bold tracking-wider">APPLICATION REJECTED</h2>
            <p className="text-[#6b7a8d] text-xs leading-relaxed">
              Your application has been declined. Please contact support for more information.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const navItems = [
    { to: "/portal", icon: BarChart3, label: "DASHBOARD" },
    { to: "/portal/opportunities", icon: Search, label: "OPPORTUNITIES" },
    { to: "/portal/portfolio", icon: Briefcase, label: "PORTFOLIO" },
    { to: "/portal/documents", icon: FileText, label: "DOCUMENTS" },
    { to: "/portal/archive", icon: History, label: "ARCHIVE" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-[#1a2035] font-mono flex flex-col">
      <header className="h-10 flex items-center justify-between border-b border-[#d0d7e2] px-4 bg-white">
        <div className="flex items-center gap-6">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">TRADE PORTAL</span>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.to}
                onClick={() => switchTab(item.to)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider transition-colors text-[#6b7a8d] hover:text-[#1a2035]"
              >
                <item.icon className="h-3 w-3" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-1 text-[#6b7a8d] hover:text-[#0066ff] transition-colors">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">
              0
            </span>
          </button>
          <span className="text-[10px] text-[#6b7a8d]">{user.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[10px] text-[#6b7a8d] hover:text-red-500 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            EXIT
          </button>
        </div>
      </header>

      <PortalTabBar />

      <main className="flex-1 overflow-auto p-4">
        {showWelcome ? (
          <PortalWelcome onComplete={handleWelcomeComplete} />
        ) : (
          <PortalKeepAlive />
        )}
      </main>

      <footer className="h-6 flex items-center justify-between border-t border-[#d0d7e2] px-4 text-[9px] text-[#8a95a5] bg-white">
        <span>TRADE PORTAL v2.0</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            CONNECTED
          </div>
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
