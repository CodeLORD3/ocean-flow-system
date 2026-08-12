import { Landmark,
  Building2,
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
  ClipboardCheck,
  TrendingUp,
  Shield,
  Factory,
  ScanLine,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ListTodo,
  LogIn,
  Truck as TruckIcon,
  MessageSquare,
  Scissors,
  History,
  ArrowLeftRight,
  Trash2,
  ShieldCheck,
  Bug,

  Activity,
} from "lucide-react";
import { PortalLogo } from "@/components/PortalLogo";
import { NavLink } from "@/components/NavLink";
import { NotificationBadge } from "@/components/NotificationBadge";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnread } from "@/hooks/useChat";
import { useIncomingTransferCount } from "@/hooks/useTransferOrders";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/lib/pageAccess";

const overviewNav = [
  { title: "Översikt", url: "/organisation", icon: BarChart3 },
  { title: "Chatt", url: "/chat", icon: MessageSquare },
];

const calendarNav = [
  { title: "Kalender", url: "/schedule", icon: CalendarDays },
  { title: "Mötesprotokoll", url: "/meetings", icon: FileText },
  { title: "Uppgifter", url: "/tasks", icon: ListTodo },
];

const salesNav = [
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kundbeställningar", url: "/customer-orders", icon: ClipboardList },
  { title: "Kunder", url: "/customers", icon: Users },
  { title: "Fakturor", url: "/invoices", icon: FileText },
];

const purchaseNav = [
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Inköpsrapportering", url: "/purchase-reporting", icon: FileText },
  { title: "Produktion", url: "/production", icon: Scissors },
  { title: "Leverantörer", url: "/suppliers", icon: Truck },
];

const inventoryNav = [
  { title: "Produkter", url: "/products", icon: Fish },
  { title: "Streckkoder", url: "/barcodes", icon: ScanLine },
];

const orgNav = [
  { title: "Butiker", url: "/stores", icon: Store },
  { title: "Bilar & Maskiner", url: "/vehicles", icon: TruckIcon },
  { title: "Anläggningar", url: "/establishments", icon: Building2 },
  { title: "Bolag", url: "/legal-entities", icon: Landmark },
  { title: "Egenkontroll", url: "/food-safety", icon: ShieldCheck },
];

const staffNav = [
  { title: "Personal", url: "/staff", icon: UserCheck },
  { title: "Live personal", url: "/live-staff", icon: Activity },
  { title: "Schema", url: "/staff-schedule", icon: CalendarRange },
];

const financeNav = [
  { title: "Rapporter", url: "/reports", icon: BarChart3 },
  { title: "Dagsrapport", url: "/dagsrapport", icon: FileText },
  { title: "Checklistor", url: "/checklist", icon: ClipboardCheck },

  { title: "Datakvalitet", url: "/coverage", icon: Shield },
  { title: "Ekonomi", url: "/finance", icon: CreditCard },
  { title: "Prognoser", url: "/forecasts", icon: TrendingUp },
];

const bottomNav = [
  { title: "Inloggningssida", url: "/landing-settings", icon: LogIn },
  { title: "Revision & Logg", url: "/audit", icon: ClipboardList },
  { title: "Felrapporter", url: "/bug-reports", icon: Bug },

  { title: "Administration", url: "/settings", icon: Settings },
];

type NavItem = { title: string; url: string; icon: any };
type NavSection = { label: string; items: NavItem[]; collapsible?: boolean };

const sections: NavSection[] = [
  { label: "Översikt", items: overviewNav },
  { label: "Kalender", items: calendarNav, collapsible: true },
  { label: "Försäljning", items: salesNav, collapsible: true },
  { label: "Inköp & Produktion", items: purchaseNav, collapsible: true },
  { label: "Lagerstyrning", items: inventoryNav, collapsible: true },
  { label: "Personal", items: staffNav, collapsible: true },
  { label: "Organisation", items: orgNav, collapsible: true },
  { label: "Ekonomi & Rapporter", items: financeNav, collapsible: true },
];

const OPEN_KEY = "admin-sidebar-open-sections";


export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => { if (isMobile) setOpenMobile(false); };
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { getCount, markAsRead } = useNotifications();
  const chatUnread = useChatUnread();
  const incomingTransfers = useIncomingTransferCount(null);

  // Varje sektion kan fällas ihop så att alla kategorier syns i korta fönster.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch { /* ignorera trasig cache */ }
    return {};
  });

  const isSectionOpen = (section: NavSection) =>
    openSections[section.label] ?? section.items.some(i => isActive(i.url));

  const setSectionOpen = (label: string, open: boolean) => {
    setOpenSections(prev => {
      const next = { ...prev, [label]: open };
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignorera */ }
      return next;
    });
  };

  // Sektionen med aktiv sida fälls alltid upp.
  useEffect(() => {
    const active = sections.find(s => s.items.some(i => isActive(i.url)));
    if (active && openSections[active.label] === false) setSectionOpen(active.label, true);
  }, [location.pathname]);

  useEffect(() => {
    const count = getCount(location.pathname);
    if (count > 0) {
      markAsRead.mutate(location.pathname);
    }
  }, [location.pathname]);

  const renderSection = (section: NavSection) => {
    if (section.collapsible) {
      const open = isSectionOpen(section);
      return (
        <SidebarGroup key={section.label}>
          <Collapsible open={open} onOpenChange={(v) => setSectionOpen(section.label, v)}>

            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="cursor-pointer flex items-center justify-between pr-2">
                {section.label}
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
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
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-r-sky-700/30 bg-gradient-to-b from-sidebar-background to-sky-950/10">
      <SidebarHeader className="p-4">
        <PortalLogo
          portalName="wholesale"
          fallbackIcon={Anchor}
          iconColorClass="text-sky-400"
          iconBgClass="bg-sky-500/20"
          title="FiskHandel"
          subtitle="Admin"
          collapsed={collapsed}
        />
      </SidebarHeader>

      <SidebarContent>
        {sections
          .map(section => ({
            ...section,
            items: section.items.filter(item => canAccessRoute("wholesale", item.url)),
          }))
          .filter(section => section.items.length > 0)
          .map(section => renderSection(section))}
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
