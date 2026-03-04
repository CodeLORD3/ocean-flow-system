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
} from "lucide-react";
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

const salesNav = [
  { title: "Beställningar", url: "/orders", icon: ShoppingCart },
  { title: "Kunder", url: "/customers", icon: Users },
  { title: "Fakturor", url: "/invoices", icon: FileText },
];

const inventoryNav = [
  { title: "Lager", url: "/inventory", icon: Fish },
  { title: "Inleveranser", url: "/receiving", icon: Package },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const orgNav = [
  { title: "Butiker", url: "/stores", icon: Store },
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20">
            <Anchor className="h-5 w-5 text-sidebar-primary" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-heading text-sm font-bold text-sidebar-accent-foreground">FiskHandel</h2>
              <p className="text-[10px] text-sidebar-foreground/60">Enterprise Resource Planning</p>
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
