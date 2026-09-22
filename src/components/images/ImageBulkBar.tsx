import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStores } from "@/hooks/useStores";
import { useZonesByStore, usePickResources, usePickProducts } from "@/hooks/useImagePickers";
import { MEDIA_KINDS, type MediaKind } from "@/lib/imageStatus";
import { useBulkClassify } from "@/hooks/useImageLibrary";
import { toast } from "sonner";

/**
 * Sticky rad för många markerade bilder. Samma statuslogik som en bild i taget:
 * 37 oplacerade + butik + område + Område/plats → alla blir klara i ett svep.
 */
export default function ImageBulkBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<MediaKind | "">("");
  const [storeId, setStoreId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [productId, setProductId] = useState("");
  const [tags, setTags] = useState("");
  const { data: stores = [] } = useStores();
  const { data: zones = [] } = useZonesByStore(storeId || null);
  const { data: resources = [] } = usePickResources();
  const { data: products = [] } = usePickProducts();
  const bulk = useBulkClassify();

  // Finns bara en butik behöver ingen välja den — områdena visas direkt.
  useEffect(() => {
    if (!storeId && stores.length === 1) setStoreId(stores[0].id);
  }, [storeId, stores]);

  if (selectedIds.length === 0) return null;

  async function apply() {
    const links: { entityType: string; entityId: string }[] = [];
    if (storeId) links.push({ entityType: "store", entityId: storeId });
    if (zoneId) links.push({ entityType: "zone", entityId: zoneId });
    if (resourceId) links.push({ entityType: "resource", entityId: resourceId });
    if (productId) links.push({ entityType: "product", entityId: productId });
    try {
      await bulk.mutateAsync({
        mediaIds: selectedIds,
        mediaKind: (kind || undefined) as MediaKind | undefined,
        links: links.length ? links : undefined,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      });
      toast.success(`${selectedIds.length} bilder uppdaterade`);
      setOpen(false);
      onClear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto border-t bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] sm:pb-3">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{selectedIds.length} markerade</span>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Stäng" : "Placera / koppla"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Avmarkera
        </Button>
      </div>

      {open && (
        <div className="mx-auto mt-3 grid max-w-[1400px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Vad visar bilderna?</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as MediaKind | "")}
            >
              <option value="">Lämna som det är</option>
              {MEDIA_KINDS.filter((k) => k.value !== "observation").map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Butik</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setZoneId("");
              }}
            >
              <option value="">Lämna som det är</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Område</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={!storeId}
            >
              <option value="">Lämna som det är</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          {kind === "resource" && (
            <div>
              <Label>Sak</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              >
                <option value="">Lämna som det är</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind === "product" && (
            <div>
              <Label>Produkt</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Lämna som det är</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label>Taggar (kommaseparerade)</Label>
            <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={apply} disabled={bulk.isPending} className="w-full">
              {bulk.isPending ? "Sparar…" : `Spara för ${selectedIds.length} bilder`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
