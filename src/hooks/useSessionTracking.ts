import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useSite } from "@/contexts/SiteContext";

const SESSION_KEY = "mt_session_id";
const HEARTBEAT_MS = 60_000; // 1 minute

const pageTitleMap: Record<string, string> = {
  "/": "Översikt",
  "/inventory": "Lager",
  "/orders": "Beställningar",
  "/suppliers": "Leverantörer",
  "/customers": "Kunder",
  "/stores": "Butiker",
  "/wholesale": "Grossist",
  "/staff": "Personal",
  "/products": "Produkter",
  "/receiving": "Inleveranser",
  "/barcodes": "Streckkoder",
  "/audit-log": "Aktivitetslogg",
  "/organisation": "Organisation",
  "/production-schedule": "Produktionsschema",
  "/production-reporting": "Produktionsrapportering",
  "/purchase-schedule": "Inköpsschema",
  "/purchase-reporting": "Inköpsrapportering",
  "/invoices": "Fakturor",
  "/dashboard": "Dashboard",
  "/tasks": "Uppgifter",
  "/companies": "Företag",
  "/trade-offers": "Trade Offers",
  "/trade-history": "Trade-historik",
  "/investment-log": "Investeringslogg",
  "/payouts": "Utbetalningar",
  "/admin-payments": "Admin Betalningar",
  "/investor-list": "Investerare",
  "/investor-portal": "Investor Portal",
  "/meeting-protocols": "Mötesprotokoll",
  "/schedule": "Kalender",
  "/shop-orders": "Butiksbeställningar",
  "/shop-reports": "Butiksrapporter",
  "/shop-wishes": "Önskelista",
  "/landing-settings": "Landing-inställningar",
  "/about-settings": "Om oss-inställningar",
  "/contact-settings": "Kontakt-inställningar",
  "/map-settings": "Karta-inställningar",
  "/pricing": "Prissättning",
  "/wholesale-orders": "Grossistbeställningar",
};

function getTitleForPath(path: string): string {
  if (pageTitleMap[path]) return pageTitleMap[path];
  // Try without trailing segments (e.g. /staff/123 -> /staff)
  const base = "/" + path.split("/").filter(Boolean)[0];
  return pageTitleMap[base] || path;
}

/**
 * Tracks user sessions and page visits.
 * - Creates a session row on login, updates last_seen periodically.
 * - On unmount/logout, closes the session and writes duration.
 * - Logs each route change as a page_visit.
 */
export function useSessionTracking() {
  const { user, staff } = useStaffAuth();
  const { site } = useSite();
  const location = useLocation();
  const sessionIdRef = useRef<string | null>(null);
  const lastPathRef = useRef<string | null>(null);

  // --- Session lifecycle ---
  useEffect(() => {
    if (!user) {
      sessionIdRef.current = null;
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      // Reuse a session id stored for this tab if recent
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) {
        sessionIdRef.current = existing;
      } else {
        const { data, error } = await supabase
          .from("user_sessions")
          .insert({
            user_id: user.id,
            staff_id: staff?.id ?? null,
            user_agent: navigator.userAgent.slice(0, 255),
            portal: site,
          })
          .select("id")
          .single();
        if (!cancelled && !error && data) {
          sessionIdRef.current = data.id;
          sessionStorage.setItem(SESSION_KEY, data.id);
        }
      }

      // Heartbeat: keep last_seen fresh
      heartbeat = setInterval(async () => {
        if (sessionIdRef.current) {
          await supabase
            .from("user_sessions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", sessionIdRef.current);
        }
      }, HEARTBEAT_MS);
    };

    start();

    const handleUnload = () => {
      if (sessionIdRef.current) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionIdRef.current}`;
        const body = JSON.stringify({ last_seen_at: new Date().toISOString() });
        try {
          navigator.sendBeacon(
            url,
            new Blob([body], { type: "application/json" })
          );
        } catch {
          /* noop */
        }
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [user?.id, staff?.id, site]);

  // --- Page visit tracking ---
  useEffect(() => {
    if (!user) return;
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;

    supabase
      .from("page_visits")
      .insert({
        user_id: user.id,
        staff_id: staff?.id ?? null,
        session_id: sessionIdRef.current,
        path: location.pathname,
        page_title: getTitleForPath(location.pathname),
        portal: site,
      })
      .then(() => {});
  }, [location.pathname, user?.id, staff?.id, site]);
}

/**
 * Closes the current session — call on explicit sign-out.
 */
export async function closeCurrentSession() {
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) return;
  const now = new Date();
  // Fetch login time to calculate duration
  const { data } = await supabase
    .from("user_sessions")
    .select("login_at")
    .eq("id", sessionId)
    .maybeSingle();
  const loginAt = data?.login_at ? new Date(data.login_at) : null;
  const duration = loginAt
    ? Math.max(0, Math.round((now.getTime() - loginAt.getTime()) / 1000))
    : null;
  await supabase
    .from("user_sessions")
    .update({
      logout_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      duration_seconds: duration,
    })
    .eq("id", sessionId);
  sessionStorage.removeItem(SESSION_KEY);
}
