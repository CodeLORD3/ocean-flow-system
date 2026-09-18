import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StaffUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  workplace: string | null;
  profile_image_url: string | null;
}

interface ActiveUserContextValue {
  activeUser: StaffUser | null;
  staff: StaffUser[];
  switchUser: (id: string) => void;
  loading: boolean;
}

const ActiveUserContext = createContext<ActiveUserContextValue | null>(null);

const STORAGE_KEY = "fiskhandel-active-user-id";

export function ActiveUserProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Den inloggade personen är alltid förvalet. Annars hamnar beställningar och
    // räkningar på första namnet i listan i stället för den som faktiskt jobbar.
    (async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, email, workplace, profile_image_url")
        .order("first_name");
      if (data) {
        setStaff(data);
        if (!activeUserId || !data.find((s) => s.id === activeUserId)) {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id ?? null;
          let mineId: string | null = null;
          if (uid) {
            const { data: mine } = await supabase
              .from("staff")
              .select("id")
              .eq("user_id", uid)
              .limit(1);
            mineId = (mine?.[0]?.id as string | undefined) ?? null;
          }
          const defaultId = mineId ?? data[0]?.id ?? null;
          setActiveUserId(defaultId);
          if (defaultId) localStorage.setItem(STORAGE_KEY, defaultId);
        }
      }
      setLoading(false);
    })();
  }, []);

  const switchUser = (id: string) => {
    setActiveUserId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const activeUser = staff.find((s) => s.id === activeUserId) ?? null;

  return (
    <ActiveUserContext.Provider value={{ activeUser, staff, switchUser, loading }}>
      {children}
    </ActiveUserContext.Provider>
  );
}

export function useActiveUser() {
  const ctx = useContext(ActiveUserContext);
  if (!ctx) throw new Error("useActiveUser must be used within ActiveUserProvider");
  return ctx;
}
