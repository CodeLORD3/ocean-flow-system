import {
  LayoutDashboard,
  Fish,
  ShoppingCart,
  Users,
  Truck,
  BarChart3,
  Settings,
  Factory,
  CalendarDays,
  Package,
  FileText,
  CreditCard,
  ClipboardList,
  TrendingUp,
  ScanLine,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const overviewNav = [
  { title: "Översikt", url: "/", icon: LayoutDashboard },
];

const produktionSectionNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Produktionsschema", url: "/production-schedule", icon: CalendarDays },
  { title: "Produktionsrapportering", url: "/production-reporting", icon: ClipboardList },
];

const inventoryNav = [
  { title: "Produkter", url: "/products", icon: Fish },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Streckkoder", url: "/barcodes", icon: ScanLine },
  { title: "Inleveranser", url: "/receiving", icon: Truck },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const financeNav = [
  { title: "Rapporter", url: "/reports", icon: BarChart3 },
  { title: "Ekonomi", url: "/finance", icon: CreditCard },
  { title: "Prognoser", url: "/forecasts", icon: TrendingUp },
];

const bottomNav = [
  { title: "Revision & Logg", url: "/audit", icon: ClipboardList },
  { title: "Administration", url: "/settings", icon: Settings },
];

type NavSection = { label: string; items: typeof overviewNav };

const sections: NavSection[] = [
  { label: "Översikt", items: overviewNav },
  { label: "Produktion", items: produktionSectionNav },
  { label: "Lagerstyrning", items: inventoryNav },
  { label: "Ekonomi & Rapporter", items: financeNav },
];

export function ProductionSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-r-amber-700/30 bg-gradient-to-b from-sidebar-background to-amber-950/10">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
            <Factory className="h-5 w-5 text-amber-400" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-heading text-sm font-bold text-sidebar-accent-foreground">FiskHandel</h2>
              <p className="text-[10px] text-sidebar-foreground/60">Produktion</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {bottomNav.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink to={item.url} end>
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
