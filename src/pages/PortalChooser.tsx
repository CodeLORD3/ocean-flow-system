import { Navigate, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, Factory, Boxes, LogOut, Loader2, Shield } from "lucide-react";
import { useStaffAuth, type PortalKey } from "@/contexts/StaffAuthContext";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import { useStoreCoverImages } from "@/hooks/useStoreCoverImages";
import { focalStyle } from "@/lib/imageFocal";
import FirstLoginPasswordChange from "./FirstLoginPasswordChange";


const PORTAL_META: Record<PortalKey, { title: string; description: string; icon: any }> = {
  shop: { title: "Butik", description: "Beställningar, lager och rapporter", icon: Store },
  wholesale: { title: "Admin", description: "Full insyn i all data från alla portaler", icon: Shield },
  production: { title: "Grossist", description: "Inköp, produktion och försäljning till butik", icon: Factory },
  admin: { title: "Admin", description: "Full åtkomst till alla portaler och data", icon: Shield },
};

export default function PortalChooser() {
  const { session, staff, loading, signOut } = useStaffAuth();
  const { setSite, setActiveStore } = useSite();
  const { data: stores = [] } = useStores();
  const storeCovers = useStoreCoverImages();

  const navigate = useNavigate();
  const [pickStore, setPickStore] = useState(false);

  const access = staff?.portal_access ?? [];
  // Butik ska alltid ligga längst till vänster i portalvalet
  const PORTAL_ORDER: PortalKey[] = ["shop", "production", "wholesale", "admin"];
  const orderedAccess = [...access].sort(
    (a, b) => PORTAL_ORDER.indexOf(a) - PORTAL_ORDER.indexOf(b)
  );
  const needsPwd = !!staff?.must_change_password;

  const allowedStores = useMemo(() => {
    // Grossistlager är ingen butiksportal och ska aldrig visas i butiksvalet
    const shopsOnly = stores.filter((s) => !s.is_wholesale);
    const ids = new Set([
      ...(staff?.allowed_store_ids ?? []),
      ...(staff?.allowed_store_id ? [staff.allowed_store_id] : []),
    ]);
    // No explicit restriction = access to all stores
    return ids.size === 0 ? shopsOnly : shopsOnly.filter((s) => ids.has(s.id));
  }, [staff?.allowed_store_ids, staff?.allowed_store_id, stores]);

  // If only one portal, jump straight in
  useEffect(() => {
    if (loading || !staff || needsPwd) return;
    if (access.length === 1) {
      if (access[0] === "shop" && stores.length === 0) return; // wait for stores
      enterPortal(access[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, staff?.id, needsPwd, stores.length]);


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

  const enterStore = (id: string, name: string) => {
    setSite("shop");
    setActiveStore(id, name);
    navigate("/organisation", { replace: true });
  };

  const enterPortal = (key: PortalKey) => {
    if (key === "admin") {
      // Admins land in wholesale view but can switch to any portal
      setSite("wholesale");
      setActiveStore(null, null);
    } else if (key === "shop") {
      if (allowedStores.length > 1) {
        setPickStore(true);
        return;
      }
      setSite("shop");
      const first = allowedStores[0];
      setActiveStore(first?.id ?? null, first?.name ?? null);
    } else {
      setSite(key);
      setActiveStore(null, null);
    }
    // Landing page is always the overview page
    navigate("/organisation", { replace: true });
  };

  if (pickStore) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-foreground">Välj butik</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Välj vilken butiksportal du vill öppna.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allowedStores.map((s) => {
              const cover = storeCovers[s.id];
              return (
                <Card
                  key={s.id}
                  onClick={() => enterStore(s.id, s.name)}
                  className="overflow-hidden cursor-pointer hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="relative aspect-[16/9] bg-muted">
                    {cover?.url ? (
                      <img
                        src={cover.url}
                        alt={`${s.name} – butiksbild`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        style={focalStyle(cover.focal_point)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Store className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 text-center">
                    <h3 className="text-base font-semibold text-foreground">{s.name}</h3>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-8 flex items-center justify-center gap-3">
            {access.length > 1 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPickStore(false)}>
                Tillbaka
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logga ut
            </Button>
          </div>
        </div>
      </div>
    );
  }

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

        <div className={`grid gap-4 ${access.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : access.length === 3 ? "md:grid-cols-3" : access.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}>

          {orderedAccess.map((key) => {
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
