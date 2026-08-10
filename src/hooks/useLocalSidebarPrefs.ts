import { useCallback, useEffect, useState } from "react";

/**
 * Sidebar-inställningar utan butik (t.ex. Grossist/Admin).
 * Samma API-form som useStoreSidebarPrefs, men sparas lokalt per webbläsare.
 */
type Stored = {
  hidden: string[];
  itemOrder: Record<string, number>;
  sectionLabels: Record<string, string>;
  sectionOrder: Record<string, number>;
};

const empty: Stored = { hidden: [], itemOrder: {}, sectionLabels: {}, sectionOrder: {} };

function read(key: string): Stored {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<Stored>) };
  } catch {
    return empty;
  }
}

export function useLocalSidebarPrefs(scope: string) {
  const key = `sidebar-prefs:${scope}`;
  const [state, setState] = useState<Stored>(() => read(key));

  useEffect(() => setState(read(key)), [key]);

  const persist = useCallback(
    (next: Stored) => {
      localStorage.setItem(key, JSON.stringify(next));
      setState(next);
    },
    [key]
  );

  const setHidden = {
    isPending: false,
    mutate: ({ navUrl, hidden }: { navUrl: string; hidden: boolean }) => {
      const set = new Set(state.hidden);
      hidden ? set.add(navUrl) : set.delete(navUrl);
      persist({ ...state, hidden: [...set] });
    },
  };

  const setItemOrder = {
    isPending: false,
    mutate: (urls: string[]) => {
      const itemOrder = { ...state.itemOrder };
      urls.forEach((u, i) => (itemOrder[u] = i));
      persist({ ...state, itemOrder });
    },
  };

  const upsertSection = {
    isPending: false,
    mutate: (rows: { section_key: string; label?: string | null; sort_order?: number | null }[]) => {
      const sectionLabels = { ...state.sectionLabels };
      const sectionOrder = { ...state.sectionOrder };
      rows.forEach((r) => {
        if (r.label !== undefined) {
          if (r.label) sectionLabels[r.section_key] = r.label;
          else delete sectionLabels[r.section_key];
        }
        if (r.sort_order !== undefined && r.sort_order !== null) sectionOrder[r.section_key] = r.sort_order;
      });
      persist({ ...state, sectionLabels, sectionOrder });
    },
  };

  return {
    hiddenUrls: state.hidden,
    isHidden: (url: string) => state.hidden.includes(url),
    itemOrder: new Map(Object.entries(state.itemOrder)),
    sectionLabels: new Map(Object.entries(state.sectionLabels)),
    sectionOrder: new Map(Object.entries(state.sectionOrder)),
    isLoading: false,
    setHidden,
    setItemOrder,
    upsertSection,
    hasStore: true,
  };
}
