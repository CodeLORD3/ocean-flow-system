import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ShopSidebar } from "@/components/ShopSidebar";
import { ProductionSidebar } from "@/components/ProductionSidebar";
import { useLocation } from "react-router-dom";
import { Bell, ChevronRight, Search, User, ArrowLeftRight, Factory, Store, ChevronDown, X, Check } from "lucide-react";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { useStores } from "@/hooks/useStores";
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

function AccountSwitcher() {
  const { activeUser, staff, switchUser } = useActiveUser();
  const initials = activeUser ? `${activeUser.first_name[0]}${activeUser.last_name[0]}` : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-2 px-2">
          <Avatar className="h-6 w-6">
            {activeUser?.profile_image_url && <AvatarImage src={activeUser.profile_image_url} />}
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-xs font-medium">
            {activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : "Välj konto"}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Byt konto</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {staff.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => switchUser(s.id)}
            className="gap-2 cursor-pointer"
          >
            <Avatar className="h-6 w-6">
              {s.profile_image_url && <AvatarImage src={s.profile_image_url} />}
              <AvatarFallback className="text-[9px] bg-muted">{s.first_name[0]}{s.last_name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs font-medium truncate">{s.first_name} {s.last_name}</span>
              <span className="text-[10px] text-muted-foreground truncate">{s.workplace || "–"}</span>
            </div>
            {activeUser?.id === s.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
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
  const retailStores = allStores.filter(s => !s.is_wholesale);
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {site === "shop" ? <ShopSidebar /> : site === "production" ? <ProductionSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top status bar */}
          <div className="h-8 flex items-center justify-between bg-sidebar-background px-4 text-xs text-sidebar-foreground/70 shrink-0">
            <div className="flex items-center gap-4">
              <span>FiskHandel ERP v2.4.1</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">
                {site === "shop" ? `Butik: ${activeStoreName || "–"}` : site === "production" ? "Produktion" : "Grossist"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    {site === "shop" ? activeStoreName || "Butik" : site === "production" ? "Produktion" : "Grossist"}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-[10px]">Välj portal</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={`text-xs gap-2 ${site === "wholesale" ? "bg-muted font-medium" : ""}`}
                    onClick={() => { setSite("wholesale"); setActiveStore(null, null); }}
                  >
                    <Factory className="h-3 w-3" /> Grossist
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={`text-xs gap-2 ${site === "production" ? "bg-muted font-medium" : ""}`}
                    onClick={() => { setSite("production"); setActiveStore(null, null); }}
                  >
                    <Factory className="h-3 w-3" /> Produktion
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px]">Butiker</DropdownMenuLabel>
                  {retailStores.length === 0 ? (
                    <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
                      Inga butiker tillagda
                    </DropdownMenuItem>
                  ) : (
                    retailStores.map(store => (
                      <DropdownMenuItem
                        key={store.id}
                        className={`text-xs gap-2 ${site === "shop" && activeStoreName === store.name ? "bg-muted font-medium" : ""}`}
                        onClick={() => { setSite("shop"); setActiveStore(store.id, store.name); }}
                      >
                        <Store className="h-3 w-3" /> {store.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="hidden sm:inline">•</span>
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="hidden sm:inline">Online</span>
            </div>
          </div>

          {/* Main header */}
          <header className="h-12 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <nav className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                {page.breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3" />}
                    <span className={i === page.breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>{crumb}</span>
                  </span>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative hidden lg:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Sök i hela systemet... (Ctrl+K)" className="h-8 w-64 pl-8 text-xs bg-muted/50" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 relative">
                    <Bell className="h-4 w-4" />
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">3</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Aviseringar</span>
                    <Badge variant="destructive" className="text-[10px]">3 nya</Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex flex-col items-start gap-1 py-2">
                    <span className="text-xs font-medium">⚠️ Lågt lager: Jätteräkor</span>
                    <span className="text-[10px] text-muted-foreground">80 kg kvar — för 5 min sedan</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex flex-col items-start gap-1 py-2">
                    <span className="text-xs font-medium">📦 Beställning bekräftad</span>
                    <span className="text-[10px] text-muted-foreground">för 23 min sedan</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AccountSwitcher />
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

          <main className="flex-1 overflow-auto p-4 lg:p-6">
            {children}
          </main>

          <div className="h-6 flex items-center justify-between border-t border-border bg-muted/30 px-4 text-[10px] text-muted-foreground shrink-0">
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
