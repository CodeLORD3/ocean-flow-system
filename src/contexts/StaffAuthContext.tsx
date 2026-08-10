import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type PortalKey = "shop" | "wholesale" | "production" | "admin";

export interface StaffProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  workplace: string | null;
  profile_image_url: string | null;
  portal_access: PortalKey[];
  allowed_store_id?: string | null;
  allowed_store_ids: string[];
  must_change_password: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  staff: StaffProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStaff = async (uid: string | undefined) => {
    if (!uid) {
      setStaff(null);
      return;
    }
    // Behörigheten bor i user_scopes. Vyn staff_access sätter ihop personalen
    // med sina scopes, så klienten har ett enda begrepp att läsa.
    // Hämtningen får inte tysta misslyckas — då blir portalvalet tomt.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("staff_access")
        .select("id, user_id, first_name, last_name, email, phone, age, workplace, profile_image_url, portal_access, allowed_store_ids, must_change_password")
        .eq("user_id", uid)
        .maybeSingle();

      if (!error) {
        setStaff((data as unknown as StaffProfile) ?? null);
        return;
      }
      // Nätverksglapp eller kall token: vänta kort och försök igen
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    setStaff(null);
  };


  const refresh = async () => {
    await loadStaff(user?.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Defer Supabase call out of the auth callback
      setTimeout(() => loadStaff(sess?.user?.id), 0);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      loadStaff(sess?.user?.id).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setStaff(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, staff, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useStaffAuth must be used within StaffAuthProvider");
  return ctx;
}
