import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { thumbUrl, THUMB_CARD } from "@/lib/imageThumb";
import { useStores } from "@/hooks/useStores";
import {
  useZonesByStore,
  usePickResources,
  usePickProducts,
  usePickTasks,
} from "@/hooks/useImagePickers";
import {
  MEDIA_KINDS,
  RELATION_TYPES,
  STATUS_CLASS,
  STATUS_LABEL,
  deriveImageStatus,
  type MediaKind,
} from "@/lib/imageStatus";
import {
  useClassifyImage,
  useCreateObservation,
  useImageLinks,
  type LibraryImage,
} from "@/hooks/useImageLibrary";
import { toast } from "sonner";

const OBSERVATION_TYPES = ["Fel", "Slitage", "Saknas", "Bra exempel", "Behöver åtgärd", "Annat"];

type Props = {
  image: LibraryImage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Butik som förval, t.ex. när man klassificerar från en butikssida. */
  defaultStoreId?: string | null;
  /** Snabbläge: spara och gå vidare till nästa bild. */
  onSavedNext?: () => void;
};

/**
 * Klassificering av en bild. Status väljs aldrig för hand — den visas bara,
 * uträknad från vad som är valt just nu.
 */
export default function ImageClassifySheet({
  image,
  open,
  onOpenChange,
  defaultStoreId,
  onSavedNext,
}: Props) {
  const { data: stores = [] } = useStores();
  const { data: links = [] } = useImageLinks(image?.id);
  const classify = useClassifyImage();
  const observe = useCreateObservation();

  const [kind, setKind] = useState<MediaKind | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [relation, setRelation] = useState("documentation");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [obsType, setObsType] = useState(OBSERVATION_TYPES[0]);
  const [obsComment, setObsComment] = useState("");
  const [search, setSearch] = useState("");

  const { data: zones = [] } = useZonesByStore(storeId);
  const { data: resources = [] } = usePickResources(kind === "resource" ? search : undefined);
  const { data: products = [] } = usePickProducts(kind === "product" ? search : undefined);
  const { data: tasks = [] } = usePickTasks(kind === "task" ? storeId : null);

  useEffect(() => {
    if (!image) return;
    setKind((image.media_kind as MediaKind | null) ?? null);
    setTitle(image.title ?? "");
    setDescription(image.description ?? "");
    setTags((image.tags ?? []).join(", "));
    const pick = (t: string) => links.find((l) => l.entity_type === t)?.entity_id ?? null;
    setStoreId(pick("store") ?? defaultStoreId ?? null);
    setZoneId(pick("zone"));
    setResourceId(pick("resource"));
    setProductId(pick("product"));
    setTaskId(pick("task"));
    setRelation(links[0]?.relation_type ?? "documentation");
    setSearch("");
    setObsComment("");
  }, [image?.id, links.length, defaultStoreId]);

  const pendingLinks = useMemo(() => {
    const out: { entity_type: string; entity_id: string }[] = [];
    if (storeId) out.push({ entity_type: "store", entity_id: storeId });
    if (zoneId) out.push({ entity_type: "zone", entity_id: zoneId });
    if (resourceId) out.push({ entity_type: "resource", entity_id: resourceId });
    if (productId) out.push({ entity_type: "product", entity_id: productId });
    if (taskId) out.push({ entity_type: "task", entity_id: taskId });
    return out;
  }, [storeId, zoneId, resourceId, productId, taskId]);

  const liveStatus = deriveImageStatus(
    { media_kind: kind, entity_type: image?.entity_type, entity_id: image?.entity_id },
    pendingLinks,
    kind === "observation" ? !!obsComment.trim() || !!obsType : false,
  );

  async function save() {
    if (!image) return;
    try {
      if (kind === "observation") {
        await observe.mutateAsync({
          mediaId: image.id,
          storeId,
          zoneId,
          observationType: obsType,
          comment: obsComment || null,
        });
        await classify.mutateAsync({
          mediaId: image.id,
          title: title || null,
          description: description || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          hasObservation: true,
        });
      } else {
        await classify.mutateAsync({
          mediaId: image.id,
          title: title || null,
          description: description || null,
          mediaKind: kind,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          links: pendingLinks.map((l) => ({
            entityType: l.entity_type,
            entityId: l.entity_id,
            relationType: relation,
          })),
          replaceTypes: ["store", "zone", "resource", "product", "task"].filter((t) =>
            pendingLinks.some((l) => l.entity_type === t) ? true : false,
          ),
        });
      }
      toast.success(`Sparad som ${STATUS_LABEL[liveStatus].toLowerCase()}`);
      if (onSavedNext) onSavedNext();
      else onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  }

  // Tangentbord i snabbläget: 1–6 väljer bildtyp, Enter sparar.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (!typing && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        setKind(MEDIA_KINDS[Number(e.key) - 1].value);
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !typing)) {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, kind, storeId, zoneId, resourceId, productId, taskId, title, description, tags, obsType, obsComment]);

  const options: { list: { id: string; name: string; hint?: string | null }[]; value: string | null; set: (v: string | null) => void; label: string } | null =
    kind === "resource"
      ? { list: resources, value: resourceId, set: setResourceId, label: "Vilken sak?" }
      : kind === "product"
        ? { list: products, value: productId, set: setProductId, label: "Vilken produkt?" }
        : kind === "task"
          ? { list: tasks, value: taskId, set: setTaskId, label: "Vilken uppgift?" }
          : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Sortera bilden
            <Badge className={STATUS_CLASS[liveStatus]}>{STATUS_LABEL[liveStatus]}</Badge>
          </SheetTitle>
        </SheetHeader>

        {image && (
          <div className="mt-4 space-y-5">
            <img
              src={thumbUrl(image.url, THUMB_CARD)}
              alt={image.title || "Bild"}
              className="max-h-64 w-full rounded-lg object-cover"
              loading="lazy"
            />

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vad visar bilden?
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MEDIA_KINDS.map((k, i) => (
                  <Button
                    key={k.value}
                    type="button"
                    variant={kind === k.value ? "default" : "outline"}
                    className="h-auto justify-start py-2 text-left"
                    onClick={() => setKind(k.value)}
                  >
                    <span className="mr-2 text-xs opacity-60">{i + 1}</span>
                    <span>
                      <span className="block text-sm">{k.label}</span>
                      <span className="block text-xs opacity-70">{k.hint}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Butik</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={storeId ?? ""}
                  onChange={(e) => {
                    setStoreId(e.target.value || null);
                    setZoneId(null);
                  }}
                >
                  <option value="">Inte valt</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {(kind === "area" || kind === "observation") && (
                <div>
                  <Label>Område</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={zoneId ?? ""}
                    onChange={(e) => setZoneId(e.target.value || null)}
                    disabled={!storeId}
                  >
                    <option value="">Inte valt</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {options && (
              <div>
                <Label>{options.label}</Label>
                <Input
                  className="mt-1"
                  placeholder="Sök..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                  {options.list.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">Inget att välja här ännu.</p>
                  )}
                  {options.list.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => options.set(options.value === o.id ? null : o.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                        options.value === o.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span>{o.name}</span>
                      {o.hint && <span className="text-xs opacity-70">{o.hint}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kind === "observation" && (
              <div className="grid gap-3">
                <div>
                  <Label>Vad såg du?</Label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={obsType}
                    onChange={(e) => setObsType(e.target.value)}
                  >
                    {OBSERVATION_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Kommentar</Label>
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={obsComment}
                    onChange={(e) => setObsComment(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Bildens roll</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                {RELATION_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3">
              <div>
                <Label>Namn (frivilligt)</Label>
                <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Beskrivning (frivilligt)</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label>Taggar (frivilligt, kommaseparerade)</Label>
                <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>

            <div className="sticky bottom-0 -mx-6 flex gap-2 border-t bg-background px-6 py-3">
              <Button onClick={save} disabled={classify.isPending || observe.isPending} className="flex-1">
                {onSavedNext ? "Spara och nästa" : "Spara"}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Stäng
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
