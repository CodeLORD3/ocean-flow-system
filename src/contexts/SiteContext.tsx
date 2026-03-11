import { createContext, useContext, useState, ReactNode } from "react";

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

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteMode>("wholesale");
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [activeStoreName, setActiveStoreName] = useState<string | null>(null);

  const setActiveStore = (id: string | null, name: string | null) => {
    setActiveStoreId(id);
    setActiveStoreName(name);
  };

  return (
    <SiteContext.Provider value={{ site, setSite, activeStoreId, activeStoreName, setActiveStore }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
