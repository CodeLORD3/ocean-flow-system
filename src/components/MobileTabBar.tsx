import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  MessageSquare,
  Receipt,
  Menu,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { canAccessRoute } from "@/lib/pageAccess";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: typeof Package };

const SHOP: Item[] = [
  { title: "Start", url: "/organisation", icon: LayoutDashboard },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kundorder", url: "/customer-orders", icon: ClipboardList },
  { title: "Ekonomi", url: "/viktiga-papper", icon: Receipt },
];

const PRODUCTION: Item[] = [
  { title: "Start", url: "/organisation", icon: LayoutDashboard },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Chatt", url: "/chat", icon: MessageSquare },
];

const ADMIN: Item[] = [
  { title: "Start", url: "/organisation", icon: LayoutDashboard },
  { title: "Lager", url: "/inventory", icon: Package },
  { title: "Ordrar", url: "/orders", icon: ShoppingCart },
  { title: "Kundorder", url: "/customer-orders", icon: ClipboardList },
];

/**
 * Bottenmeny för mobil — app-känsla med tummen nåbara genvägar.
 * Dold från och med sm-brytpunkten där sidomenyn tar över.
 */
export function MobileTabBar() {
  const { site } = useSite();
  const { switchTab } = useTabs();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();

  const base = site === "shop" ? SHOP : site === "production" ? PRODUCTION : ADMIN;
  const items = base.filter((i) => canAccessRoute(site, i.url)).slice(0, 5);

  return (
    <nav
      className="sm:hidden relative z-40 shrink-0 border-t border-border bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Snabbmeny"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = location.pathname + location.search === item.url || location.pathname === item.url;
          const Icon = item.icon;
          return (
            <button
              key={item.url}
              type="button"
              onClick={() => switchTab(item.url)}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              <span className="truncate max-w-full px-0.5">{item.title}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>Mer</span>
        </button>
      </div>
    </nav>
  );
}

export default MobileTabBar;
