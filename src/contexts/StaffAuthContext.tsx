import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type PortalKey = "shop" | "wholesale" | "production";

export interface StaffProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  workplace: string | null;
  profile_image_url: string | null;
  portal_access: PortalKey[];
  allowed_store_id: string | null;
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
    const { data } = await supabase
      .from("staff")
      .select("id, user_id, first_name, last_name, email, workplace, profile_image_url, portal_access, allowed_store_id, allowed_store_ids, must_change_password")
      .eq("user_id", uid)
      .maybeSingle();
    setStaff((data as unknown as StaffProfile) ?? null);
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
