import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Store as StoreIcon, Check, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { cn } from "@/lib/utils";

/**
 * Butiker som den inloggade får öppna. Inget explicit urval = alla butiker.
 * Grossistlager är ingen butiksportal och filtreras bort.
 */
export function useAllowedStores() {
  const { staff } = useStaffAuth();
  const { data: stores = [] } = useStores();
  return useMemo(() => {
    const access = (staff?.portal_access as string[] | undefined) ?? [];
    // Admin har full åtkomst. Saknas butiksbehörighet finns inga butiker att byta till.
    if (!access.includes("admin") && !access.includes("shop")) return [];
    const shopsOnly = stores.filter((s: any) => !s.is_wholesale);
    const ids = new Set<string>([
      ...((staff?.allowed_store_ids as string[] | undefined) ?? []),
      ...((staff as any)?.allowed_store_id ? [(staff as any).allowed_store_id as string] : []),
    ]);
    if (access.includes("admin")) return shopsOnly;
    return ids.size === 0 ? shopsOnly : shopsOnly.filter((s: any) => ids.has(s.id));
  }, [staff, stores]);
}


/** Byt aktiv butik utan att lämna sidan man står på. */
export function useSwitchStore() {
  const { setSite, setActiveStore } = useSite();
  return (id: string, name: string) => {
    setSite("shop");
    setActiveStore(id, name);
  };
}

/**
 * Snabbväxling mellan butiker direkt i sidomenyn — ett klick istället för
 * utloggning. Portalbyte sker enbart i menyn vid profilen.
 */
export function StoreSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { activeStoreId, activeStoreName } = useSite();
  const stores = useAllowedStores();
  const switchStore = useSwitchStore();

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full h-8 grid place-items-center rounded-md text-emerald-200/80 hover:bg-emerald-500/10">
          <StoreIcon className="h-4 w-4" />
        </DropdownMenuTrigger>
        <StoreMenu stores={stores} activeStoreId={activeStoreId} onPick={switchStore} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-full flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-500/10 px-2 py-1.5 text-left text-xs text-emerald-50 hover:bg-emerald-500/20 transition-colors"
        aria-label="Byt butik"
      >
        <StoreIcon className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="truncate flex-1">{activeStoreName || "Välj butik"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <StoreMenu stores={stores} activeStoreId={activeStoreId} onPick={switchStore} />
    </DropdownMenu>
  );
}

function StoreMenu({
  stores,
  activeStoreId,
  onPick,
}: {
  stores: any[];
  activeStoreId: string | null;
  onPick: (id: string, name: string) => void;
}) {
  return (
    <DropdownMenuContent align="start" className="w-60 max-h-[70vh] overflow-y-auto">
      <DropdownMenuLabel className="text-xs">Byt butik</DropdownMenuLabel>
      {stores.length === 0 && (
        <DropdownMenuItem disabled className="text-xs">
          Inga butiker tillgängliga
        </DropdownMenuItem>
      )}
      {stores.map((s) => (
        <DropdownMenuItem
          key={s.id}
          onClick={() => onPick(s.id, s.name)}
          className={cn("text-xs", s.id === activeStoreId && "font-semibold")}
        >
          <Check className={cn("h-3.5 w-3.5 mr-1.5", s.id !== activeStoreId && "opacity-0")} />
          <span className="truncate">{s.name}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );

}
