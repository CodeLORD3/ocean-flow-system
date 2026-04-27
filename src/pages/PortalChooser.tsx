import { Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, Factory, Boxes, LogOut, Loader2, Shield } from "lucide-react";
import { useStaffAuth, type PortalKey } from "@/contexts/StaffAuthContext";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import FirstLoginPasswordChange from "./FirstLoginPasswordChange";

const PORTAL_META: Record<PortalKey, { title: string; description: string; icon: any }> = {
  shop: { title: "Butik", description: "Beställningar, lager och rapporter", icon: Store },
  wholesale: { title: "Grossist", description: "Inköp, prissättning och fakturering", icon: Boxes },
  production: { title: "Produktion", description: "Produktionsschema och rapporter", icon: Factory },
  admin: { title: "Admin", description: "Full åtkomst till alla portaler och data", icon: Shield },
};

export default function PortalChooser() {
  const { session, staff, loading, signOut } = useStaffAuth();
  const { setSite, setActiveStore } = useSite();
  const { data: stores = [] } = useStores();
  const navigate = useNavigate();

  const access = staff?.portal_access ?? [];
  const needsPwd = !!staff?.must_change_password;

  // If only one portal, jump straight in
  useEffect(() => {
    if (loading || !staff || needsPwd) return;
    if (access.length === 1) {
      enterPortal(access[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, staff?.id, needsPwd]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/" replace />;
  if (needsPwd) return <FirstLoginPasswordChange />;

  if (staff && access.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-lg font-semibold mb-2">Ingen portal-åtkomst</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Ditt konto har inga portaler tilldelade. Kontakta administratören.
        </p>
        <Button variant="outline" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Logga ut
        </Button>
      </div>
    );
  }

  const enterPortal = (key: PortalKey) => {
    if (key === "admin") {
      // Admins land in wholesale view but can switch to any portal
      setSite("wholesale");
      setActiveStore(null, null);
    } else if (key === "shop") {
      setSite("shop");
      const allowedIds = [
        ...(staff?.allowed_store_ids ?? []),
        ...(staff?.allowed_store_id ? [staff.allowed_store_id] : []),
      ];
      if (allowedIds.length === 1) {
        const store = stores.find((s) => s.id === allowedIds[0]);
        setActiveStore(allowedIds[0], store?.name ?? null);
      } else {
        // Multiple or none → let user pick from sidebar dropdown
        setActiveStore(null, null);
      }
    } else {
      setSite(key);
      setActiveStore(null, null);
    }
    const saved = sessionStorage.getItem("erp_last_route");
    const target = saved && saved !== "/" && saved !== "/choose-portal" ? saved : "/inventory";
    navigate(target, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Hej {staff?.first_name}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Välj vilken portal du vill öppna.
          </p>
        </div>

        <div className={`grid gap-4 ${access.length === 3 ? "md:grid-cols-3" : access.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {access.map((key) => {
            const meta = PORTAL_META[key];
            const Icon = meta.icon;
            return (
              <Card
                key={key}
                onClick={() => enterPortal(key)}
                className="p-6 cursor-pointer hover:border-primary hover:shadow-md transition-all group"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">{meta.title}</h3>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logga ut
          </Button>
        </div>
      </div>
    </div>
  );
}
