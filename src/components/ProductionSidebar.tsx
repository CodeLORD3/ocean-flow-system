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
  UserCheck,
  SlidersHorizontal,
  CalendarRange,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { canAccessRoute } from "@/lib/pageAccess";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnread } from "@/hooks/useChat";
import { useIncomingTransferCount } from "@/hooks/useTransferOrders";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocalSidebarPrefs } from "@/hooks/useLocalSidebarPrefs";
import { SidebarVisibilityDialog } from "@/components/SidebarVisibilityDialog";
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

const orgNav = [
  { title: "Personal", url: "/staff", icon: UserCheck },
  { title: "Schema", url: "/staff-schedule", icon: CalendarRange },
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
  { label: "Organisation", items: orgNav },
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
  const { hiddenUrls, itemOrder, sectionLabels, sectionOrder } = useLocalSidebarPrefs("production");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const LOCKED_URLS = ["/organisation"];

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
          .map((section, sIdx) => ({
            ...section,
            label: sectionLabels.get(section.label) ?? section.label,
            sortOrder: sectionOrder.get(section.label) ?? sIdx,
            fallback: sIdx,
            items: section.items
              .filter(
                (item) =>
                  canAccessRoute("production", item.url) &&
                  (LOCKED_URLS.includes(item.url) || !hiddenUrls.includes(item.url))
              )
              .map((item, i) => ({ ...item, sortOrder: itemOrder.get(item.url) ?? i, fallback: i }))
              .sort((a, b) => a.sortOrder - b.sortOrder || a.fallback - b.fallback),
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.fallback - b.fallback)
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
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              {!collapsed && <span>Anpassa meny</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
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

      <SidebarVisibilityDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        localScope="production"
        sections={sections.map((s) => ({
          label: s.label,
          items: s.items.map((i) => ({ title: i.title, url: i.url })),
        }))}
        lockedUrls={LOCKED_URLS}
      />
    </Sidebar>
  );
}
