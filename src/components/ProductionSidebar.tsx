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
  ScanLine,
  MessageSquare,
  Scissors,
  Star,
  History,
  ArrowLeftRight,
  Trash2,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { canAccessRoute } from "@/lib/pageAccess";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnread } from "@/hooks/useChat";
import { useIncomingTransferCount } from "@/hooks/useTransferOrders";
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
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Inköpsrapportering", url: "/purchase-reporting", icon: FileText },
  { title: "Produktion", url: "/production", icon: Scissors },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const salesNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kundbeställningar", url: "/customer-orders", icon: ClipboardList },
  { title: "Önskemål", url: "/store-wishes", icon: Star },
];

const bottomNav = [
  { title: "Rapporter", url: "/reports", icon: BarChart3 },
  { title: "Administration", url: "/settings", icon: Settings },
];

type NavSection = { label: string; items: typeof overviewNav };

const sections: NavSection[] = [
  { label: "Översikt", items: overviewNav },
  { label: "Inköp & Produktion", items: purchaseNav },
  { label: "Försäljning", items: salesNav },
];

export function ProductionSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { getCount, markAsRead } = useNotifications();
  const chatUnread = useChatUnread();
  const incomingTransfers = useIncomingTransferCount(null);

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
                        {!collapsed && <NotificationBadge count={getCount(item.url) + (item.url === "/chat" ? chatUnread.total : 0) + (item.url === "/stock-transfers" || item.url === "/inventory" ? incomingTransfers : 0)} />}
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
