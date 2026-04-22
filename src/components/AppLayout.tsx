import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ShopSidebar } from "@/components/ShopSidebar";
import { ProductionSidebar } from "@/components/ProductionSidebar";

import { useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Search, User, ArrowLeftRight, Factory, Store, ChevronDown, X, Check, LogOut } from "lucide-react";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { useStores } from "@/hooks/useStores";
import { useSessionTracking, closeCurrentSession } from "@/hooks/useSessionTracking";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, { title: string; breadcrumb: string[] }> = {
  "/": { title: "Översikt", breadcrumb: ["Hem", "Översikt"] },
  "/inventory": { title: "Lagerhantering", breadcrumb: ["Hem", "Lager", "Alla produkter"] },
  "/orders": { title: "Beställningar", breadcrumb: ["Hem", "Försäljning", "Beställningar"] },
  "/suppliers": { title: "Leverantörer", breadcrumb: ["Hem", "Lagerstyrning", "Leverantörer"] },
  "/customers": { title: "Kunder", breadcrumb: ["Hem", "Försäljning", "Kunder"] },
  "/stores": { title: "Butikshantering", breadcrumb: ["Hem", "Organisation", "Butiker"] },
  "/wholesale": { title: "Produktion & Grossist", breadcrumb: ["Hem", "Organisation", "Grossist"] },
  "/reports": { title: "Rapporter & Analys", breadcrumb: ["Hem", "Rapporter"] },
  "/staff": { title: "Personalhantering", breadcrumb: ["Hem", "HR", "Personal"] },
  "/settings": { title: "Systeminställningar", breadcrumb: ["Hem", "Administration", "Inställningar"] },
  "/products": { title: "Produkter", breadcrumb: ["Hem", "Lagerstyrning", "Produkter"] },
  "/receiving": { title: "Inleveranser", breadcrumb: ["Hem", "Lagerstyrning", "Inleveranser"] },
  "/barcodes": { title: "Streckkoder", breadcrumb: ["Hem", "Lagerstyrning", "Streckkoder"] },
};

function AccountMenu() {
  const { staff, signOut } = useStaffAuth();
  const navigate = useNavigate();
  const initials = staff ? `${staff.first_name[0]}${staff.last_name[0]}` : "?";
  const portalCount = staff?.portal_access?.length ?? 0;

  const handleSignOut = async () => {
    await closeCurrentSession();
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-2 px-2">
          <Avatar className="h-6 w-6">
            {staff?.profile_image_url && <AvatarImage src={staff.profile_image_url} />}
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-xs font-medium">
            {staff ? `${staff.first_name} ${staff.last_name}` : "Konto"}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          <div className="flex flex-col">
            <span>{staff ? `${staff.first_name} ${staff.last_name}` : "—"}</span>
            <span className="text-[10px] text-muted-foreground font-normal">{staff?.email ?? ""}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portalCount > 1 && (
          <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => navigate("/choose-portal")}>
            <ArrowLeftRight className="h-3.5 w-3.5" /> Byt portal
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={handleSignOut}>
          <LogOut className="h-3.5 w-3.5" /> Logga ut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const page = pageTitles[location.pathname] || { title: "Sida", breadcrumb: ["Hem"] };
  const { site, setSite, activeStoreName, setActiveStore } = useSite();
  const { tabs, activeTab, closeTab, switchTab } = useTabs();
  const { data: allStores = [] } = useStores();
  const { staff } = useStaffAuth();
  useSessionTracking();

  const access = staff?.portal_access ?? [];
  const lockedStoreId = staff?.allowed_store_id ?? null;
  const lockedStoreIds = staff?.allowed_store_ids ?? [];
  const allowedSet = new Set<string>([
    ...lockedStoreIds,
    ...(lockedStoreId ? [lockedStoreId] : []),
  ]);
  const retailStores = allStores
    .filter((s) => !s.is_wholesale)
    .filter((s) => allowedSet.size === 0 || allowedSet.has(s.id));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {site === "shop" ? <ShopSidebar /> : site === "production" ? <ProductionSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top status bar — hidden on mobile to save vertical space */}
          <div className="hidden sm:flex h-8 items-center justify-between bg-sidebar-background px-4 text-xs text-foreground shrink-0">
            <div className="flex items-center gap-4">
              <span>
                {site === "shop" ? `Butik: ${activeStoreName || "–"}` : site === "production" ? "Produktion" : "Grossist"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-foreground hover:text-foreground hover:bg-sidebar-accent"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    {site === "shop" ? activeStoreName || "Butik" : site === "production" ? "Produktion" : "Grossist"}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-[10px]">Välj portal</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {access.includes("wholesale") && (
                    <DropdownMenuItem
                      className={`text-xs gap-2 ${site === "wholesale" ? "bg-muted font-medium" : ""}`}
                      onClick={() => { setSite("wholesale"); setActiveStore(null, null); switchTab("/organisation"); }}
                    >
                      <Factory className="h-3 w-3" /> Grossist
                    </DropdownMenuItem>
                  )}
                  {access.includes("production") && (
                    <DropdownMenuItem
                      className={`text-xs gap-2 ${site === "production" ? "bg-muted font-medium" : ""}`}
                      onClick={() => { setSite("production"); setActiveStore(null, null); switchTab("/organisation"); }}
                    >
                      <Factory className="h-3 w-3" /> Produktion
                    </DropdownMenuItem>
                  )}
                  {access.includes("shop") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px]">Butiker</DropdownMenuLabel>
                      {retailStores.length === 0 ? (
                        <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
                          Inga butiker tillgängliga
                        </DropdownMenuItem>
                      ) : (
                        retailStores.map((store) => (
                          <DropdownMenuItem
                            key={store.id}
                            className={`text-xs gap-2 ${site === "shop" && activeStoreName === store.name ? "bg-muted font-medium" : ""}`}
                            onClick={() => { setSite("shop"); setActiveStore(store.id, store.name); switchTab("/organisation"); }}
                          >
                            <Store className="h-3 w-3" /> {store.name}
                          </DropdownMenuItem>
                        ))
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <span>•</span>
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>Online</span>
            </div>
          </div>

          {/* Main header — taller tap targets on mobile */}
          <header className="h-14 sm:h-12 flex items-center justify-between border-b border-border bg-card px-3 sm:px-4 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="h-10 w-10 sm:h-7 sm:w-7" />
              <nav className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                {page.breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3" />}
                    <span className={i === page.breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>{crumb}</span>
                  </span>
                ))}
              </nav>
              {/* On mobile show only the current page title */}
              <span className="md:hidden text-sm font-semibold text-foreground truncate">
                {page.title}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <div className="relative hidden lg:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Sök i hela systemet... (Ctrl+K)" className="h-8 w-64 pl-8 text-xs bg-muted/50" />
              </div>

              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8">
                <Bell className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>

              <AccountMenu />
            </div>
          </header>

          {/* Tab bar */}
          <div className="h-9 flex items-end bg-card border-b border-border px-2 shrink-0 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const isActive = tab.path === activeTab;
              return (
                <div
                  key={tab.path}
                  className={`group relative flex items-center gap-1.5 h-8 px-3 cursor-pointer text-xs border border-b-0 rounded-t-md transition-colors select-none ${
                    isActive
                      ? "bg-background border-border text-foreground font-medium -mb-px z-10"
                      : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                  onClick={() => switchTab(tab.path)}
                >
                  <span className="truncate max-w-[120px]">{tab.title}</span>
                  {tabs.length > 1 && (
                    <button
                      className={`flex items-center justify-center h-4 w-4 rounded-sm transition-opacity ${
                        isActive
                          ? "opacity-60 hover:opacity-100 hover:bg-muted"
                          : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
            {children}
          </main>

          {/* Footer — hidden on mobile to save vertical space */}
          <div className="hidden sm:flex h-6 items-center justify-between border-t border-border bg-muted/30 px-4 text-[10px] text-muted-foreground shrink-0">
            <span>FiskHandel AB © 2026</span>
            <div className="flex items-center gap-3">
              <span>Databas: Ansluten</span>
              <span>API: v2.4</span>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
