import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ShopSidebar } from "@/components/ShopSidebar";
import { useLocation } from "react-router-dom";
import { Bell, ChevronRight, Search, User, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSite } from "@/contexts/SiteContext";
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const page = pageTitles[location.pathname] || { title: "Sida", breadcrumb: ["Hem"] };
  const { site, setSite } = useSite();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {site === "shop" ? <ShopSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top status bar */}
          <div className="h-8 flex items-center justify-between bg-sidebar-background px-4 text-xs text-sidebar-foreground/70 shrink-0">
            <div className="flex items-center gap-4">
              <span>FiskHandel ERP v2.4.1</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">
                {site === "shop" ? "Butiksportal" : "Grossist/Produktion"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Site switcher */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setSite(site === "shop" ? "wholesale" : "shop")}
              >
                <ArrowLeftRight className="h-3 w-3" />
                Byt till {site === "shop" ? "Grossist" : "Butik"}
              </Button>
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-2 px-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="hidden sm:inline text-xs font-medium">
                      {site === "shop" ? "Butikschef" : "Admin"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Johan Eriksson</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Min profil</DropdownMenuItem>
                  <DropdownMenuItem>Inställningar</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Logga ut</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page title bar */}
          <div className="h-11 flex items-center justify-between border-b border-border bg-card/50 px-6 shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-sm font-semibold text-foreground">{page.title}</h1>
              <Badge variant="outline" className="text-[9px] h-4">
                {site === "shop" ? "Butik" : "Grossist"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{new Date().toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
            </div>
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
