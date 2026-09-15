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
  /** Rollen styr vad kontot får göra inom personalmodulen. */
  primary_role: string | null;
  is_platform_admin: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  staff: StaffProfile | null;
  loading: boolean;
  lastError: string | null;
  signOut: () => Promise<void>;
  hardSignOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  // Laddning är klar först när både session OCH behörighet är avgjord —
  // annars hinner gaten se en tom profil vid omladdning och kasta till portalvalet.
  const loading = sessionLoading || staffLoading;

  const loadStaff = async (uid: string | undefined, opts?: { silent?: boolean }) => {
    if (!uid) {
      setStaff(null);
      setStaffLoading(false);
      return;
    }
    // Tyst omhämtning (manuellt "Försök igen") får inte låsa hela gränssnittet
    if (!opts?.silent) setStaffLoading(true);
    try {
      await fetchStaff(uid);
    } finally {
      if (!opts?.silent) setStaffLoading(false);
    }
  };


  const fetchStaff = async (uid: string) => {
    // Behörigheten bor i user_scopes. Vyn staff_access sätter ihop personalen
    // med sina scopes, så klienten har ett enda begrepp att läsa.
    // Hämtningen får inte tysta misslyckas — då blir portalvalet tomt.
    let lastMessage: string | null = null;
    // Backend kan vara kall efter inaktivitet: första svaret dröjer ibland
    // flera sekunder. Ge det gott om försök innan vi visar ett fel.
    const waits = [500, 1200, 2500];
    for (let attempt = 0; attempt < waits.length + 1; attempt++) {
      const { data, error } = await supabase
        .from("staff_access")
        .select("id, user_id, first_name, last_name, email, phone, age, workplace, profile_image_url, portal_access, allowed_store_ids, must_change_password, primary_role, is_platform_admin")
        .eq("user_id", uid)
        .maybeSingle();

      if (!error) {
        setStaff((data as unknown as StaffProfile) ?? null);
        setLastError(null);
        return;
      }
      lastMessage = `${(error as any).code ?? "fel"}: ${error.message}`;
      console.error("[auth] kunde inte hämta staff_access", error);
      // Nätverksglapp eller kall token: vänta och försök igen
      if (attempt < waits.length) {
        await new Promise((r) => setTimeout(r, waits[attempt]));
      }
    }

    setStaff(null);
    setLastError(lastMessage);

    // Är sessionen död? Då är detta ingen bugg utan en utloggning.
    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (userError || !verified?.user) {
      await hardSignOut();
    }
  };



  const refresh = async () => {
    await loadStaff(user?.id, { silent: true });
  };


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Defer Supabase call out of the auth callback
      setTimeout(() => loadStaff(sess?.user?.id), 0);
      // Aldrig fastna i evig snurra — även misslyckad förnyelse släpper laddning
      setSessionLoading(false);
      if (!sess?.user) setStaffLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      loadStaff(sess?.user?.id).finally(() => setSessionLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearLocal = () => {
    try {
      sessionStorage.removeItem("erp_site_context");
    } catch {
      /* ignore */
    }
    setSession(null);
    setUser(null);
    setStaff(null);
    setStaffLoading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Nollställ portalvalet så nästa inloggning alltid börjar i portalvalet
    clearLocal();
  };

  // Död session: rensa allt lokalt även om servern inte kan nås
  const hardSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
    clearLocal();
    setLastError(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, staff, loading, lastError, signOut, hardSignOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );

}

export function useStaffAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useStaffAuth must be used within StaffAuthProvider");
  return ctx;
}
