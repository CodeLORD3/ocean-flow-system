import { createContext, useContext, useState, ReactNode } from "react";

export type SiteMode = "shop" | "wholesale";

interface SiteContextType {
  site: SiteMode;
  setSite: (s: SiteMode) => void;
}

const SiteContext = createContext<SiteContextType>({ site: "shop", setSite: () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteMode>("shop");
  return (
    <SiteContext.Provider value={{ site, setSite }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
