import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface PortalTab {
  path: string;
  title: string;
}

const PORTAL_TITLES: Record<string, string> = {
  "/portal": "Dashboard",
  "/portal/opportunities": "Opportunities",
  "/portal/portfolio": "Portfolio",
  "/portal/commitments": "My Commitments",
  "/portal/documents": "Documents",
  "/portal/archive": "Archive",
  "/portal/about": "About Us",
  "/portal/how-it-works": "How It Works",
};

export function getPortalTitle(path: string): string {
  if (PORTAL_TITLES[path]) return PORTAL_TITLES[path];
  if (path.startsWith("/portal/offer/")) return "Offer Detail";
  return "Page";
}

interface PortalTabsContextValue {
  tabs: PortalTab[];
  activeTab: string;
  closeTab: (path: string) => void;
  switchTab: (path: string) => void;
  openOfferTab: (offerId: string, title: string) => void;
}

const PortalTabsContext = createContext<PortalTabsContextValue | null>(null);

export function PortalTabsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<PortalTab[]>([
    { path: "/portal", title: "Dashboard" },
  ]);
  const [activeTab, setActiveTab] = useState(location.pathname);

  useEffect(() => {
    const path = location.pathname;
    setActiveTab(path);
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, title: getPortalTitle(path) }];
    });
  }, [location.pathname]);

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.path === path);
        const next = prev.filter((t) => t.path !== path);
        if (path === activeTab) {
          const newIdx = Math.min(idx, next.length - 1);
          navigate(next[newIdx].path);
        }
        return next;
      });
    },
    [activeTab, navigate]
  );

  const switchTab = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  const openOfferTab = useCallback(
    (offerId: string, title: string) => {
      const path = `/portal/offer/${offerId}`;
      setTabs((prev) => {
        if (prev.some((t) => t.path === path)) return prev;
        return [...prev, { path, title }];
      });
      navigate(path);
    },
    [navigate]
  );

  return (
    <PortalTabsContext.Provider value={{ tabs, activeTab, closeTab, switchTab, openOfferTab }}>
      {children}
    </PortalTabsContext.Provider>
  );
}

export function usePortalTabs() {
  const ctx = useContext(PortalTabsContext);
  if (!ctx) throw new Error("usePortalTabs must be used within PortalTabsProvider");
  return ctx;
}
