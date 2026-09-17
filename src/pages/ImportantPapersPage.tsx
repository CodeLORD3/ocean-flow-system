import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSite } from "@/contexts/SiteContext";
import { useAllowedStores } from "@/components/StoreSwitcher";
import { ImportantPapers } from "@/components/tasks/ImportantPapers";

/** Egen sida för Ekonomi → Viktiga papper (kvitton, följesedlar, fakturor, brev, kort). */
export default function ImportantPapersPage() {
  const { site, activeStoreId } = useSite();
  const { data: stores = [] } = useAllowedStores();
  const [picked, setPicked] = useState<string | null>(null);

  const storeId = useMemo(() => {
    if (site === "shop") return activeStoreId ?? null;
    return picked ?? activeStoreId ?? stores[0]?.id ?? null;
  }, [site, activeStoreId, picked, stores]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Viktiga papper</h1>
          <p className="text-sm text-muted-foreground">
            Kvitton, följesedlar, fakturor, brev, anteckningar och kort.
          </p>
        </div>
        {site !== "shop" && (
          <Select value={storeId ?? ""} onValueChange={setPicked}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="Välj butik" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ImportantPapers storeId={storeId} />
    </div>
  );
}
