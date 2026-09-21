import { useMemo, useState } from "react";
import { Boxes, Camera, ChevronDown, ChevronRight, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { useFloorPlans, useMapZones } from "@/hooks/useStoreMap";
import { useUploadEntityImage } from "@/hooks/useEntityImages";
import {
  RESOURCE_TYPES,
  resourceTypeLabel,
  useResourceItems,
  useResourceLocations,
  useResourceStores,
  useSaveResourceItem,
  useSaveResourceLocation,
  type ResourceItem,
} from "@/hooks/useResources";
import {
  RESOURCE_INBOX_TYPE,
  useLinkPhotoToResource,
  useNameResourcePhoto,
  useResourceInbox,
  useResourceItemPhotos,
} from "@/hooks/useResourcePhotos";
import { RESOURCE_REGIONS, scopeLabel, storesInScope } from "@/lib/resourceScope";

/**
 * "Utrustning & material": alla saker arbetet behöver, med antal, värde,
 * var man köper dem och var de finns. Platsen finns bara här — uppgifterna
 * hämtar den härifrån (5S).
 *
 * Listan kan summeras per butik, per region (Göteborg, Stockholm, Schweiz)
 * eller för hela organisationen, så frågor som "hur många vakuummaskiner har
 * vi och var" går att svara på med en sökning.
 *
 * Bildinkorgen låter personalen fota saker först och namnge dem i efterhand,
 * innan bilden kopplas till rätt sak.
 */
export default function ResourceRegister() {
  const { activeStoreId: storeId } = useSite();
  const { data: items = [] } = useResourceItems();
  const { data: allLocations = [] } = useResourceLocations(null);
  const { data: stores = [] } = useResourceStores();
  const { data: plans = [] } = useFloorPlans(storeId ?? null);
  const { data: zones = [] } = useMapZones(plans[0]?.id ?? null);
  const { data: photos = [] } = useResourceItemPhotos(items.map((i) => i.id));
  const saveItem = useSaveResourceItem();
  const saveLocation = useSaveResourceLocation();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("alla");
  const [scope, setScope] = useState(storeId ? `butik:${storeId}` : "allt");
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<ResourceItem> | null>(null);

  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? null;
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Okänd butik";
  const photoOf = (itemId: string) => photos.find((p) => p.entity_id === itemId)?.url ?? null;

  const scopeStores = useMemo(() => storesInScope(scope, stores), [scope, stores]);
  const scopeIds = useMemo(() => new Set(scopeStores.map((s) => s.id)), [scopeStores]);

  /** Var saken finns och hur många, inom valda butiker. */
  const placesOf = (itemId: string) =>
    allLocations.filter((l) => l.resource_id === itemId && scopeIds.has(l.store_id));
  const countOf = (itemId: string) =>
    placesOf(itemId).reduce((a, l) => a + (l.quantity ?? 1), 0);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (i) =>
          (type === "alla" || i.resource_type === type) &&
          (q === "" ||
            i.name.toLowerCase().includes(q) ||
            (i.category ?? "").toLowerCase().includes(q) ||
            (i.supplier ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [items, search, type]);

  const totalInScope = shown.reduce((a, i) => a + countOf(i.id), 0);
  const totalValue = shown.reduce((a, i) => a + countOf(i.id) * (i.unit_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Utrustning &amp; material</h1>
          <p className="text-sm text-muted-foreground">
            Vad vi har, hur många och var — per butik, region eller hela organisationen.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setEdit({ name: "", resource_type: "utrustning", reusable: true })}>
          <Plus className="mr-1 h-4 w-4" /> Ny sak
        </Button>
      </div>

      <Tabs defaultValue="saker">
        <TabsList>
          <TabsTrigger value="saker">Saker vi har</TabsTrigger>
          <TabsTrigger value="inkorg">Bildinkorg</TabsTrigger>
        </TabsList>

        <TabsContent value="saker" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök sak, t.ex. vakuummaskin, laxkniv, etikettskrivare"
                className="pl-8"
              />
            </div>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allt">Hela organisationen</SelectItem>
                {RESOURCE_REGIONS.map((r) => (
                  <SelectItem key={r.key} value={`region:${r.key}`}>
                    {r.label}
                  </SelectItem>
                ))}
                {stores.map((s) => (
                  <SelectItem key={s.id} value={`butik:${s.id}`}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48">
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

          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {scopeLabel(scope, stores)} · {shown.length} slags saker · {totalInScope} st
            {totalValue > 0 ? ` · värde ${Math.round(totalValue).toLocaleString("sv-SE")} kr` : ""}
          </p>

          {shown.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              <Boxes className="mx-auto mb-2 h-8 w-8" />
              <p>Inga saker matchar sökningen.</p>
            </Card>
          ) : (
            <div className="border-t border-grid-line">
              {shown.map((item) => {
                const places = placesOf(item.id);
                const count = countOf(item.id);
                const isOpen = open === item.id;
                const img = item.image ?? photoOf(item.id);
                return (
                  <div key={item.id} className="border-x border-b border-grid-line bg-card">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : item.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      {img ? (
                        <img src={img} alt={item.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                          <Boxes className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {resourceTypeLabel(item.resource_type)}
                          {item.category ? ` · ${item.category}` : ""}
                          {places.length > 0 ? ` · ${places.length} platser` : " · ingen plats angiven"}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-sm font-semibold">
                        {count} {item.unit ?? "st"}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="space-y-2 border-t border-primary/20 px-3 pb-3 pt-2.5">
                        {item.supplier && (
                          <p className="text-xs text-muted-foreground">
                            Köps hos {item.supplier}
                            {item.supplier_article_no ? ` (${item.supplier_article_no})` : ""}
                          </p>
                        )}
                        {places.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Ingen butik har angett var saken finns.</p>
                        ) : (
                          <div className="space-y-1">
                            {places.map((l) => (
                              <div key={l.id} className="flex items-center gap-2 text-sm">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{storeName(l.store_id)}</span>
                                <span className="text-muted-foreground">
                                  {[zoneName(l.map_zone_id), l.location_text, l.position_code]
                                    .filter(Boolean)
                                    .join(" · ") || "plats inte angiven"}
                                </span>
                                <span className="ml-auto font-mono tabular-nums">
                                  {l.quantity ?? 1} {item.unit ?? "st"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {storeId && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {(() => {
                              const loc = allLocations.find(
                                (l) => l.resource_id === item.id && l.store_id === storeId,
                              );
                              const save = (patch: Record<string, unknown>) =>
                                saveLocation.mutate({
                                  resourceId: item.id,
                                  storeId,
                                  mapZoneId: loc?.map_zone_id ?? null,
                                  locationText: loc?.location_text ?? null,
                                  positionCode: loc?.position_code ?? null,
                                  quantity: loc?.quantity ?? null,
                                  ...patch,
                                });
                              return (
                                <>
                                  <Select
                                    value={loc?.map_zone_id ?? "none"}
                                    onValueChange={(v) => save({ mapZoneId: v === "none" ? null : v })}
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
                                    onBlur={(e) => save({ locationText: e.target.value })}
                                  />
                                  <Input
                                    className="w-28"
                                    placeholder="ST-01"
                                    defaultValue={loc?.position_code ?? ""}
                                    onBlur={(e) => save({ positionCode: e.target.value })}
                                  />
                                  <Input
                                    className="w-24"
                                    inputMode="numeric"
                                    placeholder="Antal"
                                    defaultValue={loc?.quantity ?? ""}
                                    onBlur={(e) =>
                                      save({ quantity: e.target.value === "" ? null : Number(e.target.value) })
                                    }
                                  />
                                </>
                              );
                            })()}
                          </div>
                        )}

                        <Button variant="outline" size="sm" onClick={() => setEdit(item)}>
                          Ändra saken
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="inkorg">
          <ResourceInbox items={items} onCreateItem={setEdit} />
        </TabsContent>
      </Tabs>

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
                    onChange={(e) =>
                      setEdit({ ...edit, total_count: e.target.value === "" ? null : Number(e.target.value) })
                    }
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
                    onChange={(e) =>
                      setEdit({ ...edit, unit_value: e.target.value === "" ? null : Number(e.target.value) })
                    }
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

/**
 * Bildinkorgen: personalen fotar sakerna, bilderna namnges i efterhand och
 * kopplas sedan till rätt sak i registret.
 */
function ResourceInbox({
  items,
  onCreateItem,
}: {
  items: ResourceItem[];
  onCreateItem: (draft: Partial<ResourceItem>) => void;
}) {
  const { activeStoreId: storeId } = useSite();
  const { data: stores = [] } = useResourceStores();
  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const targetStore = storeId ?? pickedStore ?? stores[0]?.id ?? null;
  const { data: inbox = [] } = useResourceInbox(null);
  const { data: allLocations = [] } = useResourceLocations(null);
  const upload = useUploadEntityImage();
  const rename = useNameResourcePhoto();
  const link = useLinkPhotoToResource();
  const saveLocation = useSaveResourceLocation();

  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files || !targetStore) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await upload.mutateAsync({ entityType: RESOURCE_INBOX_TYPE, entityId: targetStore, file });
      }
      toast({ title: `${files.length} bilder i inkorgen`, description: "Namnge dem och koppla till rätt sak." });
    } catch (e: any) {
      toast({ title: "Kunde inte ladda upp", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        {!storeId && (
          <Select value={targetStore ?? ""} onValueChange={setPickedStore}>
            <SelectTrigger className="w-56">
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
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
            busy && "opacity-60",
          )}
        >
          <Camera className="h-4 w-4" /> {busy ? "Laddar upp…" : "Lägg in bilder"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addPhotos(e.target.files)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Fota sakerna nu — namnge och placera dem i registret när du har tid.
        </p>
      </Card>

      {inbox.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <Camera className="mx-auto mb-2 h-8 w-8" />
          <p>Inkorgen är tom.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inbox.map((photo) => {
            const name = names[photo.id] ?? photo.title ?? "";
            const store = stores.find((s) => s.id === photo.entity_id);
            return (
              <Card key={photo.id} className="space-y-2 overflow-hidden">
                <img src={photo.url} alt={name || "Bild i inkorgen"} className="aspect-[4/3] w-full object-cover" />
                <div className="space-y-2 p-3">
                  <p className="text-xs text-muted-foreground">
                    {store?.name ?? "Okänd butik"}
                    {photo.uploaded_by_name ? ` · ${photo.uploaded_by_name}` : ""}
                  </p>
                  <Input
                    value={name}
                    placeholder="Namn på bilden, t.ex. Vakuummaskin bakom disken"
                    onChange={(e) => setNames((s) => ({ ...s, [photo.id]: e.target.value }))}
                    onBlur={() => {
                      if (name.trim() && name.trim() !== (photo.title ?? ""))
                        rename.mutate({ id: photo.id, title: name });
                    }}
                  />
                  <Select
                    onValueChange={async (v) => {
                      try {
                        if (v === "ny") {
                          onCreateItem({ name: name.trim(), resource_type: "utrustning", reusable: true });
                          return;
                        }
                        await link.mutateAsync({
                          photoId: photo.id,
                          url: photo.url,
                          resourceId: v,
                          title: name,
                        });
                        const item = items.find((i) => i.id === v);
                        // Har butiken redan en plats för saken lämnas antalet orört.
                        const hasPlace = allLocations.some(
                          (l) => l.resource_id === v && l.store_id === photo.entity_id,
                        );
                        if (photo.entity_id && !hasPlace)
                          saveLocation.mutate({ resourceId: v, storeId: photo.entity_id, quantity: 1 });
                        toast({ title: "Bilden är kopplad", description: item?.name });
                      } catch (e: any) {
                        toast({ title: "Kunde inte koppla", description: e.message, variant: "destructive" });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Koppla till sak" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ny">Ny sak med detta namn…</SelectItem>
                      {items.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
