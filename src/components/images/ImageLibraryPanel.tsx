import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { thumbUrl, THUMB_FULL } from "@/lib/imageThumb";
import { Search } from "lucide-react";
import ImageLibraryGrid from "./ImageLibraryGrid";
import ImageBulkBar from "./ImageBulkBar";
import ImageClassifySheet from "./ImageClassifySheet";
import ImageQuickClassify from "./ImageQuickClassify";
import ImageLinksPanel from "./ImageLinksPanel";
import ImageActivityTimeline from "./ImageActivityTimeline";
import AddImageFlow from "./AddImageFlow";
import { useImageLibrary, useImageStatusCounts, type LibraryImage } from "@/hooks/useImageLibrary";
import { STATUS_LABEL, type ImageStatus, type MediaKind } from "@/lib/imageStatus";

type TabKey = "all" | MediaKind | "unplaced" | "partial";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "area", label: "Områden" },
  { key: "resource", label: "Saker" },
  { key: "product", label: "Produkter" },
  { key: "task", label: "Uppgifter" },
  { key: "observation", label: "Iakttagelser" },
  { key: "unplaced", label: "Oplacerade" },
];

/**
 * Bildbiblioteket: alla bilder på ett ställe, sökbara och sorterbara.
 * En bild laddas upp en gång och kan höra till flera ställen.
 */
export default function ImageLibraryPanel({ storeId }: { storeId?: string | null }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LibraryImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<LibraryImage | null>(null);
  const [editing, setEditing] = useState<LibraryImage | null>(null);
  const [quick, setQuick] = useState<ImageStatus | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filter = useMemo(() => {
    const base: { status?: ImageStatus | "all"; mediaKind?: MediaKind | "all"; search?: string } = {
      search: debounced || undefined,
    };
    if (tab === "unplaced") base.status = "unclassified";
    else if (tab === "partial") base.status = "partial";
    else if (tab !== "all") base.mediaKind = tab;
    return base;
  }, [tab, debounced]);

  const { data, isLoading, isFetching } = useImageLibrary(filter, page);
  const { data: counts } = useImageStatusCounts();

  useEffect(() => {
    setPage(0);
    setRows([]);
    setSelected([]);
  }, [tab, debounced]);

  useEffect(() => {
    if (!data) return;
    setRows((prev) => (page === 0 ? data.rows : [...prev, ...data.rows]));
  }, [data, page]);

  // Ctrl/Cmd+A markerar allt synligt, Esc avmarkerar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(rows.map((r) => r.id));
      }
      if (e.key === "Escape") setSelected([]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows]);

  const unplaced = counts?.unclassified ?? 0;
  const partial = counts?.partial ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Sök namn, beskrivning eller bildtext"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <AddImageFlow storeId={storeId} label="Lägg till bild" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Diskret arbetsstatus — ingen felmarkering, bara vad som återstår */}
      {(unplaced > 0 || partial > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {unplaced > 0 && (
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{unplaced}</span> oplacerade
              <Button size="sm" variant="outline" className="h-7" onClick={() => setQuick("unclassified")}>
                Sortera
              </Button>
            </span>
          )}
          {partial > 0 && (
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{partial}</span> delvis klara
              <Button size="sm" variant="outline" className="h-7" onClick={() => setQuick("partial")}>
                Fortsätt
              </Button>
            </span>
          )}
        </div>
      )}

      {isLoading && rows.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ImageLibraryGrid
          images={rows}
          selectedIds={selected}
          onSelectedChange={setSelected}
          onOpen={(i) => setDetail(rows[i])}
        />
      )}

      {data?.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={isFetching}>
            {isFetching ? "Hämtar…" : "Visa fler bilder"}
          </Button>
        </div>
      )}

      <ImageBulkBar selectedIds={selected} onClear={() => setSelected([])} />

      {/* Bilddetalj: bilden, vad den hör till och vem som gjort vad */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.title || "Bild"}
              {detail && <Badge variant="outline">{STATUS_LABEL[detail.status]}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <img
                src={thumbUrl(detail.url, THUMB_FULL)}
                alt={detail.title || "Bild"}
                className="max-h-[50vh] w-full rounded-lg object-contain"
              />
              {detail.description && <p className="text-sm">{detail.description}</p>}
              {detail.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <ImageLinksPanel image={detail} onEdit={() => setEditing(detail)} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Historik</h3>
                <ImageActivityTimeline mediaId={detail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImageClassifySheet
        image={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        defaultStoreId={storeId}
      />

      <QuickRunner status={quick} onClose={() => setQuick(null)} storeId={storeId} />
    </div>
  );
}

/** Hämtar just de bilder som ska sorteras och kör snabbläget. */
function QuickRunner({
  status,
  onClose,
  storeId,
}: {
  status: ImageStatus | null;
  onClose: () => void;
  storeId?: string | null;
}) {
  const { data } = useImageLibrary({ status: status ?? "unclassified" }, 0);
  const images = status ? (data?.rows ?? []) : [];
  if (!status || images.length === 0) return null;
  return (
    <ImageQuickClassify
      images={images}
      open
      onClose={onClose}
      defaultStoreId={storeId}
    />
  );
}
