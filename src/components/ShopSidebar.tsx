import {
  LayoutDashboard, ShoppingCart, Users, Fish, Package, Truck, Store, UserCheck, BarChart3, Settings, Anchor, CreditCard, ClipboardList, CalendarDays, Star, BookOpen, ListTodo, ChevronDown, FileText,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const overviewNav = [
  { title: "Översikt", url: "/organisation", icon: LayoutDashboard },
];

const calendarNav = [
  { title: "Kalender", url: "/schedule", icon: CalendarDays },
  { title: "Mötesprotokoll", url: "/meetings", icon: FileText },
  { title: "Uppgifter", url: "/tasks", icon: ListTodo },
];

const salesNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kunder", url: "/customers", icon: Users },
  { title: "Önskemål", url: "/wishes", icon: Star },
];

const inventoryNav = [
  { title: "Produkter", url: "/products", icon: Fish },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Prissättning", url: "/pricing", icon: CreditCard },
  { title: "Inleveranser", url: "/receiving", icon: Truck },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const orgNav = [
  { title: "Personal", url: "/staff", icon: UserCheck },
  { title: "Aktivitetslogg", url: "/audit", icon: ClipboardList },
];

const financeNav = [
  { title: "Rapporter", url: "/reports", icon: BarChart3 },
];

type NavItem = { title: string; url: string; icon: any };
type NavSection = { label: string; items: NavItem[]; collapsible?: boolean };

const sections: NavSection[] = [
  { label: "Översikt", items: overviewNav },
  { label: "Kalender", items: calendarNav, collapsible: true },
  { label: "Inköp", items: salesNav },
  { label: "Lagerstyrning", items: inventoryNav },
  { label: "Organisation", items: orgNav },
  { label: "Rapporter", items: financeNav },
];

export function ShopSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { getCount, markAsRead } = useNotifications();
  
  const { activeStoreId, activeStoreName } = useSite();
  const { data: stores } = useStores();
  const activeStore = stores?.find(s => s.id === activeStoreId);

  const calendarRoutes = calendarNav.map(n => n.url);
  const isCalendarActive = calendarRoutes.some(r => isActive(r));
  const [calendarOpen, setCalendarOpen] = useState(isCalendarActive);

  useEffect(() => {
    if (isCalendarActive && !calendarOpen) setCalendarOpen(true);
  }, [isCalendarActive]);

  useEffect(() => {
    const count = getCount(location.pathname);
    if (count > 0) {
      markAsRead.mutate(location.pathname);
    }
  }, [location.pathname]);

  const renderSection = (section: NavSection) => {
    if (section.collapsible) {
      return (
        <SidebarGroup key={section.label}>
          <Collapsible open={calendarOpen} onOpenChange={setCalendarOpen}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="cursor-pointer flex items-center justify-between pr-2">
                {section.label}
                <ChevronDown className={cn("h-3 w-3 transition-transform", calendarOpen && "rotate-180")} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <NavLink to={item.url} end>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                          {!collapsed && <NotificationBadge count={getCount(item.url)} />}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      );
    }

    return (
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
                    {!collapsed && <NotificationBadge count={getCount(item.url)} />}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-r-emerald-700/30" style={{ background: 'hsl(160 30% 12%)' }}>
      <SidebarHeader className="p-4">
        <PortalLogo
          portalName="shop"
          fallbackIcon={Store}
          iconColorClass="text-emerald-400"
          iconBgClass="bg-emerald-500/20"
          title={activeStoreName || "Butiksportal"}
          subtitle="Butiksvy"
          collapsed={collapsed}
          storeId={activeStoreId}
          storeLogoUrl={activeStore?.logo_url}
        />
      </SidebarHeader>

      <SidebarContent>
        {sections.map(section => renderSection(section))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <NavLink to="/settings" end>
                <Settings className="h-4 w-4" />
                {!collapsed && <span>Inställningar</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
