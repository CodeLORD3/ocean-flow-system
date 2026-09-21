import { useMemo, useState } from "react";
import { Boxes, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/SiteContext";
import { useFloorPlans, useMapZones } from "@/hooks/useStoreMap";
import {
  RESOURCE_TYPES,
  resourceTypeLabel,
  useResourceItems,
  useResourceLocations,
  useSaveResourceItem,
  useSaveResourceLocation,
  type ResourceItem,
} from "@/hooks/useResources";

/**
 * "Utrustning & material": alla saker arbetet behöver, med antal, värde,
 * var man köper dem och var de finns i butiken. Platsen finns bara här —
 * uppgifterna hämtar den härifrån (5S).
 */
export default function ResourceRegister() {
  const { activeStoreId: storeId } = useSite();
  const { data: items = [] } = useResourceItems();
  const { data: locations = [] } = useResourceLocations(storeId);
  const { data: plans = [] } = useFloorPlans(storeId ?? null);
  const { data: zones = [] } = useMapZones(plans[0]?.id ?? null);
  const saveItem = useSaveResourceItem();
  const saveLocation = useSaveResourceLocation();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("alla");
  const [edit, setEdit] = useState<Partial<ResourceItem> | null>(null);

  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? null;

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (type === "alla" || i.resource_type === type) &&
          (search.trim() === "" ||
            i.name.toLowerCase().includes(search.toLowerCase()) ||
            (i.category ?? "").toLowerCase().includes(search.toLowerCase())),
      ),
    [items, search, type],
  );

  const totalValue = shown.reduce((a, i) => a + (i.total_count ?? 0) * (i.unit_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">Utrustning &amp; material</h1>
        <Button className="ml-auto" onClick={() => setEdit({ name: "", resource_type: "utrustning", reusable: true })}>
          <Plus className="mr-1 h-4 w-4" /> Ny sak
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök" className="pl-8" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla typer</SelectItem>
            {RESOURCE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <Boxes className="mx-auto mb-2 h-8 w-8" />
          <p>Inga saker är inlagda ännu.</p>
        </Card>
      ) : (
        <>
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {shown.length} saker · värde {totalValue.toLocaleString("sv-SE")} kr
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {shown.map((item) => {
              const loc = locations.find((l) => l.resource_id === item.id);
              return (
                <Card key={item.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {resourceTypeLabel(item.resource_type)}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.total_count !== null ? ` · ${item.total_count} ${item.unit ?? "st"}` : ""}
                      </p>
                      {item.supplier && (
                        <p className="text-xs text-muted-foreground">
                          Köps hos {item.supplier}
                          {item.supplier_article_no ? ` (${item.supplier_article_no})` : ""}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEdit(item)}>
                      Ändra
                    </Button>
                  </div>

                  {storeId && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={loc?.map_zone_id ?? "none"}
                        onValueChange={(v) =>
                          saveLocation.mutate({
                            resourceId: item.id,
                            storeId,
                            mapZoneId: v === "none" ? null : v,
                            locationText: loc?.location_text ?? null,
                            positionCode: loc?.position_code ?? null,
                            quantity: loc?.quantity ?? null,
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Område" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Inget område</SelectItem>
                          {zones.map((z) => (
                            <SelectItem key={z.id} value={z.id}>
                              {z.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-32"
                        placeholder="Plats"
                        defaultValue={loc?.location_text ?? ""}
                        onBlur={(e) =>
                          saveLocation.mutate({
                            resourceId: item.id,
                            storeId,
                            mapZoneId: loc?.map_zone_id ?? null,
                            locationText: e.target.value,
                            positionCode: loc?.position_code ?? null,
                            quantity: loc?.quantity ?? null,
                          })
                        }
                      />
                      <Input
                        className="w-28"
                        placeholder="ST-01"
                        defaultValue={loc?.position_code ?? ""}
                        onBlur={(e) =>
                          saveLocation.mutate({
                            resourceId: item.id,
                            storeId,
                            mapZoneId: loc?.map_zone_id ?? null,
                            locationText: loc?.location_text ?? null,
                            positionCode: e.target.value,
                            quantity: loc?.quantity ?? null,
                          })
                        }
                      />
                      {loc?.map_zone_id && (
                        <span className="text-xs text-muted-foreground">{zoneName(loc.map_zone_id)}</span>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Ändra saken" : "Ny sak"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Namn</label>
                <Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Typ</label>
                  <Select
                    value={edit.resource_type ?? "utrustning"}
                    onValueChange={(v) => setEdit({ ...edit, resource_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Kategori</label>
                  <Input value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Antal totalt</label>
                  <Input
                    inputMode="decimal"
                    value={edit.total_count ?? ""}
                    onChange={(e) => setEdit({ ...edit, total_count: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Enhet</label>
                  <Input value={edit.unit ?? ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Värde per styck</label>
                  <Input
                    inputMode="decimal"
                    value={edit.unit_value ?? ""}
                    onChange={(e) => setEdit({ ...edit, unit_value: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Köps hos</label>
                  <Input value={edit.supplier ?? ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Artikelnummer</label>
                  <Input
                    value={edit.supplier_article_no ?? ""}
                    onChange={(e) => setEdit({ ...edit, supplier_article_no: e.target.value })}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await saveItem.mutateAsync({ ...edit, name: edit.name ?? "" });
                    setEdit(null);
                    toast({ title: "Sparat" });
                  } catch (e: any) {
                    toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
                  }
                }}
              >
                Spara
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
