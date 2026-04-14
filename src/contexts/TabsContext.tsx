import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense, ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface TabItem {
  path: string;
  title: string;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Översikt",
  "/inventory": "Lagerhantering",
  "/orders": "Ordrar",
  "/suppliers": "Leverantörer",
  "/customers": "Kunder",
  "/stores": "Butiker",
  "/wholesale": "Grossist",
  "/organisation": "Organisation",
  "/staff": "Personal",
  "/reports": "Rapporter",
  "/finance": "Ekonomi",
  "/forecasts": "Prognoser",
  "/invoices": "Fakturor",
  "/purchase-reporting": "Inköpsrapporter",
  "/receiving": "Inleveranser",
  "/products": "Produkter",
  "/barcodes": "Streckkoder",
  "/pricing": "Prissättning",
  "/purchase-schedule": "Inköpsschema",
  "/production-schedule": "Produktionsschema",
  "/production-reporting": "Produktionsrapporter",
  "/audit": "Revision & Logg",
  "/settings": "Inställningar",
  "/shop-reports": "Butiksrapporter",
  "/schedule": "Kalender",
  "/map-settings": "Map Settings",
  "/meetings": "Mötesprotokoll",
};

export function getTitleForPath(path: string): string {
  return PAGE_TITLES[path] || "Sida";
}

interface TabsContextValue {
  tabs: TabItem[];
  activeTab: string;
  closeTab: (path: string) => void;
  switchTab: (path: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TabItem[]>([
    { path: location.pathname, title: getTitleForPath(location.pathname) },
  ]);
  const [activeTab, setActiveTab] = useState(location.pathname);

  // When location changes, add tab if not exists and persist route
  useEffect(() => {
    const path = location.pathname;
    setActiveTab(path);
    sessionStorage.setItem("erp_last_route", path);
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, title: getTitleForPath(path) }];
    });
  }, [location.pathname]);

  // On mount, restore last route if we landed on "/"
  useEffect(() => {
    const saved = sessionStorage.getItem("erp_last_route");
    if (saved && saved !== "/" && location.pathname === "/") {
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <TabsContext.Provider value={{ tabs, activeTab, closeTab, switchTab }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within TabsProvider");
  return ctx;
}
