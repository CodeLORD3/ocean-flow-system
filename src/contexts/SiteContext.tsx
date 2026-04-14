import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type SiteMode = "shop" | "wholesale" | "production";

interface SiteContextType {
  site: SiteMode;
  setSite: (s: SiteMode) => void;
  activeStoreId: string | null;
  activeStoreName: string | null;
  setActiveStore: (id: string | null, name: string | null) => void;
}

const SiteContext = createContext<SiteContextType>({
  site: "wholesale",
  setSite: () => {},
  activeStoreId: null,
  activeStoreName: null,
  setActiveStore: () => {},
});

const SITE_STORAGE_KEY = "erp_site_context";

function getStoredSiteContext() {
  if (typeof window === "undefined") {
    return {
      site: "wholesale" as SiteMode,
      activeStoreId: null as string | null,
      activeStoreName: null as string | null,
    };
  }

  try {
    const raw = sessionStorage.getItem(SITE_STORAGE_KEY);
    if (!raw) {
      return {
        site: "wholesale" as SiteMode,
        activeStoreId: null as string | null,
        activeStoreName: null as string | null,
      };
    }

    const parsed = JSON.parse(raw) as {
      site?: SiteMode;
      activeStoreId?: string | null;
      activeStoreName?: string | null;
    };

    return {
      site: parsed.site ?? "wholesale",
      activeStoreId: parsed.activeStoreId ?? null,
      activeStoreName: parsed.activeStoreName ?? null,
    };
  } catch {
    return {
      site: "wholesale" as SiteMode,
      activeStoreId: null as string | null,
      activeStoreName: null as string | null,
    };
  }
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteMode>(() => getStoredSiteContext().site);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(() => getStoredSiteContext().activeStoreId);
  const [activeStoreName, setActiveStoreName] = useState<string | null>(() => getStoredSiteContext().activeStoreName);

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
      })
    );
  }, [site, activeStoreId, activeStoreName]);

  return (
    <SiteContext.Provider value={{ site, setSite, activeStoreId, activeStoreName, setActiveStore }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
