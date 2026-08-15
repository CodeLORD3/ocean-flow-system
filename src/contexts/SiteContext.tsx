import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type SiteMode = "shop" | "wholesale" | "production";

interface SiteContextType {
  site: SiteMode;
  setSite: (s: SiteMode) => void;
  activeStoreId: string | null;
  activeStoreName: string | null;
  setActiveStore: (id: string | null, name: string | null) => void;
  /** Har användaren aktivt valt portal (och butik) i portalvalet? */
  portalChosen: boolean;
  /** Nollställ portalvalet, t.ex. vid utloggning eller byte av portal */
  clearPortal: () => void;
}

const SiteContext = createContext<SiteContextType>({
  site: "wholesale",
  setSite: () => {},
  activeStoreId: null,
  activeStoreName: null,
  setActiveStore: () => {},
  portalChosen: false,
  clearPortal: () => {},
});

const SITE_STORAGE_KEY = "erp_site_context";

function getStoredSiteContext() {
  if (typeof window === "undefined") {
    return {
      site: "wholesale" as SiteMode,
      activeStoreId: null as string | null,
      activeStoreName: null as string | null,
      chosen: false,
    };
  }

  try {
    const raw = sessionStorage.getItem(SITE_STORAGE_KEY);
    if (!raw) {
      return {
        site: "wholesale" as SiteMode,
        activeStoreId: null as string | null,
        activeStoreName: null as string | null,
        chosen: false,
      };
    }

    const parsed = JSON.parse(raw) as {
      site?: SiteMode;
      activeStoreId?: string | null;
      activeStoreName?: string | null;
      chosen?: boolean;
    };

    return {
      site: parsed.site ?? "wholesale",
      activeStoreId: parsed.activeStoreId ?? null,
      activeStoreName: parsed.activeStoreName ?? null,
      chosen: parsed.chosen ?? false,
    };
  } catch {
    return {
      site: "wholesale" as SiteMode,
      activeStoreId: null as string | null,
      activeStoreName: null as string | null,
      chosen: false,
    };
  }
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteMode>(() => getStoredSiteContext().site);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(() => getStoredSiteContext().activeStoreId);
  const [activeStoreName, setActiveStoreName] = useState<string | null>(() => getStoredSiteContext().activeStoreName);
  const [portalChosen, setPortalChosen] = useState<boolean>(() => getStoredSiteContext().chosen);

  const setSiteMode = (s: SiteMode) => {
    setSite(s);
    setPortalChosen(true);
  };

  const clearPortal = () => {
    setPortalChosen(false);
    setActiveStoreId(null);
    setActiveStoreName(null);
  };

  const setActiveStore = (id: string | null, name: string | null) => {
    setActiveStoreId(id);
    setActiveStoreName(name);
  };

  useEffect(() => {
    sessionStorage.setItem(
      SITE_STORAGE_KEY,
      JSON.stringify({
        site,
        activeStoreId,
        activeStoreName,
        chosen: portalChosen,
      })
    );
  }, [site, activeStoreId, activeStoreName, portalChosen]);

  return (
    <SiteContext.Provider value={{ site, setSite: setSiteMode, activeStoreId, activeStoreName, setActiveStore, portalChosen, clearPortal }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
