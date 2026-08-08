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
  MessageSquare,
  Scissors,
  Star,
  History,
  ArrowLeftRight,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { canAccessRoute } from "@/lib/pageAccess";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnread } from "@/hooks/useChat";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
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
  { title: "Översikt", url: "/organisation", icon: LayoutDashboard },
  { title: "Kalender", url: "/schedule", icon: CalendarDays },
  { title: "Chatt", url: "/chat", icon: MessageSquare },
];

const purchaseNav = [
  { title: "Inköpsschema", url: "/purchase-schedule", icon: CalendarDays },
  { title: "Inköpsrapportering", url: "/purchase-reporting", icon: FileText },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Lagerrörelser", url: "/stock-movements", icon: History },
  { title: "Överföringar", url: "/stock-transfers", icon: ArrowLeftRight },
  { title: "Registrera ankomst", url: "/arrivals", icon: Truck },

  { title: "Svinn", url: "/waste", icon: Trash2 },
  { title: "Spårbarhet — partier", url: "/traceability", icon: ShieldCheck },
  { title: "Inleveranser", url: "/receiving", icon: Truck },
];

const salesNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Önskemål", url: "/store-wishes", icon: Star },
];

const produktionSectionNav = [
  { title: "Filé/Tillverkning", url: "/production", icon: Scissors },
  { title: "Produktionsschema", url: "/production-schedule", icon: CalendarDays },
  { title: "Produktionsrapportering", url: "/production-reporting", icon: ClipboardList },
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
  { label: "Inköp", items: purchaseNav },
  { label: "Försäljning", items: salesNav },
  { label: "Produktion", items: produktionSectionNav },
  { label: "Ekonomi & Rapporter", items: financeNav },
];

export function ProductionSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { getCount, markAsRead } = useNotifications();
  const chatUnread = useChatUnread();

  useEffect(() => {
    const count = getCount(location.pathname);
    if (count > 0) {
      markAsRead.mutate(location.pathname);
    }
  }, [location.pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-r-amber-700/30 bg-gradient-to-b from-sidebar-background to-amber-950/10">
      <SidebarHeader className="p-4">
        <PortalLogo
          portalName="production"
          fallbackIcon={Factory}
          iconColorClass="text-amber-400"
          iconBgClass="bg-amber-500/20"
          title="FiskHandel"
          subtitle="Grossist"
          collapsed={collapsed}
        />
      </SidebarHeader>

      <SidebarContent>
        {sections
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => canAccessRoute("production", item.url)),
          }))
          .filter((section) => section.items.length > 0)
          .map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end onClick={closeMobileSidebar}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && <NotificationBadge count={getCount(item.url) + (item.url === "/chat" ? chatUnread.total : 0)} />}
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
                <NavLink to={item.url} end onClick={closeMobileSidebar}>
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
