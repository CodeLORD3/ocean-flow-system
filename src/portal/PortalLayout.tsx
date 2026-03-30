import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Search, Briefcase, Archive, LogOut, X, Bell, User, Users, ChevronDown } from "lucide-react";
import PortalWelcome from "./PortalWelcome";
import { PortalTabsProvider, usePortalTabs } from "./PortalTabsContext";
import PortalOpportunities from "./PortalOpportunities";
import PortalPortfolio from "./PortalPortfolio";
import PortalCommitments from "./PortalCommitments";
import PortalDocuments from "./PortalDocuments";
import PortalArchive from "./PortalArchive";
import PortalOfferDetail from "./PortalOfferDetail";
import PortalAbout from "./PortalAbout";
import PortalHowItWorks from "./PortalHowItWorks";
import PortalContact from "./PortalContact";
import PortalTeam from "./PortalTeam";
import PortalProfile from "./PortalProfile";
import PortalNotifications from "./PortalNotifications";
import PortalNotificationDropdown from "./PortalNotificationDropdown";
import PortalTerms from "./PortalTerms";
import PortalPrivacy from "./PortalPrivacy";
import PortalGuidelines from "./PortalGuidelines";

/* ── Tab bar (browser-like) ── */
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
                onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
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

/* ── Keep-alive content renderer ── */
function PortalKeepAlive() {
  const { tabs, activeTab } = usePortalTabs();
  const renderedTabs = useMemo(() => {
    return tabs.map((tab) => {
      let component: React.ReactNode = null;
      if (tab.path === "/portal" || tab.path === "/portal/opportunities") component = <PortalOpportunities />;
      else if (tab.path === "/portal/portfolio") component = <PortalPortfolio />;
      else if (tab.path === "/portal/commitments") component = <PortalCommitments />;
      else if (tab.path === "/portal/documents") component = <PortalDocuments />;
      else if (tab.path === "/portal/archive") component = <PortalArchive />;
      else if (tab.path === "/portal/about") component = <PortalAbout />;
      else if (tab.path === "/portal/team") component = <PortalTeam />;
      else if (tab.path === "/portal/how-it-works") component = <PortalHowItWorks />;
      else if (tab.path === "/portal/contact") component = <PortalContact />;
      else if (tab.path === "/portal/profile") component = <PortalProfile />;
      else if (tab.path === "/portal/notifications") component = <PortalNotifications />;
      else if (tab.path === "/portal/terms") component = <PortalTerms />;
      else if (tab.path === "/portal/privacy") component = <PortalPrivacy />;
      else if (tab.path === "/portal/guidelines") component = <PortalGuidelines />;
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

/* ── User dropdown ── */
function UserDropdown({ user, profile, onLogout, onProfile }: {
  user: any; profile: any; onLogout: () => void; onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = profile
    ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase()
    : (user.email?.[0] || "U").toUpperCase();
  const displayName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : user.email;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="h-7 w-7 bg-[#1a3a4a] rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-[10px]">{initials}</span>
        </div>
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-border rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => { setOpen(false); onProfile(); }}
            className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-muted/50 flex items-center gap-2"
          >
            <User className="h-3.5 w-3.5" /> My Profile
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full text-left px-4 py-2 text-xs text-destructive hover:bg-muted/50 flex items-center gap-2"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main inner layout ── */
function PortalInner() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();
  const { switchTab, activeTab } = usePortalTabs();
  const queryClient = useQueryClient();

  const { data: portalNotifCount = 0 } = useQuery({
    queryKey: ["portal-notification-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("portal", "investor")
        .eq("is_read", false);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("portal-notif-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Auth listener
  useEffect(() => {
    let mounted = true;

    const loadProfile = async (userId: string) => {
      const { data: prof } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!mounted) return;
      setProfile(prof);
      setLoading(false);
      const hasSeenWelcome = localStorage.getItem("portal-welcome-seen");
      if (!hasSeenWelcome) setShowWelcome(true);
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session?.user) {
        setLoading(false);
        navigate("/portal/login");
        return;
      }
      setUser(session.user);
      loadProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (!session?.user) {
        setLoading(false);
        navigate("/portal/login");
        return;
      }
      setUser(session.user);
      loadProfile(session.user.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  const handleWelcomeComplete = () => {
    localStorage.setItem("portal-welcome-seen", "true");
    setShowWelcome(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary text-sm animate-pulse">Loading your account...</div>
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    { to: "/portal", icon: Search, label: "Opportunities" },
    { to: "/portal/portfolio", icon: Briefcase, label: "My Investments" },
    { to: "/portal/archive", icon: Archive, label: "Archive" },
    { to: "/portal/team", icon: Users, label: "Team" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
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
          <PortalNotificationDropdown onNavigate={(path) => switchTab(path)} />
          <div className="h-6 w-px bg-border" />
          <UserDropdown
            user={user}
            profile={profile}
            onLogout={handleLogout}
            onProfile={() => switchTab("/portal/profile")}
          />
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

      <footer className="border-t border-border bg-white px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-start justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-[8px]">OT</span>
            </div>
            <span className="text-xs font-semibold text-foreground">Ocean Trade</span>
          </div>
          <div className="flex gap-10">
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Resources</div>
              <button onClick={() => switchTab("/portal/documents")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">Documents</button>
              <button onClick={() => switchTab("/portal/how-it-works")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">How It Works</button>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Company</div>
              <button onClick={() => switchTab("/portal/about")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">About Us</button>
              <button onClick={() => switchTab("/portal/contact")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">Contact & Support</button>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Legal</div>
              <button onClick={() => switchTab("/portal/terms")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">Terms of Use</button>
              <button onClick={() => switchTab("/portal/privacy")} className="block text-[11px] text-muted-foreground hover:text-primary transition-colors">Privacy Policy</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>System Online</span>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto mt-3 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} Ocean Trade. All rights reserved.</p>
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
