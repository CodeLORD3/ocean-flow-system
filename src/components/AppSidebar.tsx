import {
  LayoutDashboard,
  Fish,
  ShoppingCart,
  Users,
  Truck,
  BarChart3,
  Settings,
  Anchor,
  Store,
  UserCheck,
  Package,
  FileText,
  CreditCard,
  ClipboardList,
  TrendingUp,
  Shield,
  Factory,
  ScanLine,
  CalendarDays,
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
  { title: "Översikt", url: "/organisation", icon: BarChart3 },
];

const salesNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kunder", url: "/customers", icon: Users },
  { title: "Fakturor", url: "/invoices", icon: FileText },
];

const purchaseNav = [
  { title: "Inköpsschema", url: "/purchase-schedule", icon: CalendarDays },
  { title: "Inköpsrapportering", url: "/purchase-reporting", icon: FileText },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const productionNav = [
  { title: "Produktionsschema", url: "/production-schedule", icon: CalendarDays },
  { title: "Produktionsrapportering", url: "/production-reporting", icon: FileText },
];

const inventoryNav = [
  { title: "Produkter", url: "/products", icon: Fish },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Streckkoder", url: "/barcodes", icon: ScanLine },
  { title: "Inleveranser", url: "/receiving", icon: Truck },
];

const orgNav = [
  { title: "Översikt", url: "/organisation", icon: BarChart3 },
  { title: "Butiker", url: "/stores", icon: Store },
  { title: "Produktion/Grossist", url: "/wholesale", icon: Factory },
  { title: "Personal", url: "/staff", icon: UserCheck },
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
  { label: "Försäljning", items: salesNav },
  { label: "Inköp", items: purchaseNav },
  { label: "Produktion", items: productionNav },
  { label: "Lagerstyrning", items: inventoryNav },
  { label: "Organisation", items: orgNav },
  { label: "Ekonomi & Rapporter", items: financeNav },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-r-sky-700/30 bg-gradient-to-b from-sidebar-background to-sky-950/10">
      <SidebarHeader className="p-4">
        <PortalLogo
          portalName="wholesale"
          fallbackIcon={Anchor}
          iconColorClass="text-sky-400"
          iconBgClass="bg-sky-500/20"
          title="FiskHandel"
          subtitle="Enterprise Resource Planning"
          collapsed={collapsed}
        />
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
