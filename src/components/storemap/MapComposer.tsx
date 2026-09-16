import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Image as ImageIcon, Send } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useLogActivity } from "@/hooks/useActivityLog";
import { useSaveDeviation } from "@/hooks/useFoodSafety";
import { useUploadEntityImage } from "@/hooks/useEntityImages";

export type ComposerTarget = { entityType: "map_zone" | "map_object"; entityId: string; label: string; storeId: string };

/**
 * En och samma ruta för kommentar, anmärkning och avvikelse. Allt sparas i de
 * tabeller systemet redan använder: kommentarer i aktivitetsloggen,
 * anmärkning och avvikelse i avvikelseregistret.
 */
export function MapComposer({ target, portal }: { target: ComposerTarget; portal: string }) {
  const [mode, setMode] = useState<"comment" | "note" | "issue">("comment");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { staff } = useStaffAuth();
  const log = useLogActivity();
  const saveDeviation = useSaveDeviation();
  const upload = useUploadEntityImage();

  const actor = staff ? `${staff.first_name} ${staff.last_name}` : "Okänd";

  const submit = async () => {
    const text = body.trim();
    if (!text && !file) return;
    try {
      if (file) {
        await upload.mutateAsync({
          entityType: target.entityType,
          entityId: target.entityId,
          file,
          caption: text || undefined,
          imageKind: mode === "issue" ? "issue" : "general",
        });
      }
      if (text) {
        if (mode === "comment") {
          await log.mutateAsync({
            action_type: "comment",
            description: text,
            portal,
            store_id: target.storeId,
            entity_type: target.entityType,
            entity_id: target.entityId,
            details: { author: actor, label: target.label },
          });
        } else {
          await saveDeviation.mutateAsync({
            source: target.entityType,
            source_id: target.entityId,
            title: `${mode === "note" ? "Anmärkning" : "Avvikelse"}: ${target.label}`,
            description: text,
            store_id: target.storeId,
            responsible: actor,
          } as never);
          await log.mutateAsync({
            action_type: mode === "note" ? "note" : "issue",
            description: text,
            portal,
            store_id: target.storeId,
            entity_type: target.entityType,
            entity_id: target.entityId,
            details: { author: actor, label: target.label },
          });
        }
      }
      setBody("");
      setFile(null);
      toast({ title: mode === "comment" ? "Kommentar sparad" : mode === "note" ? "Anmärkning skapad" : "Avvikelse skapad" });
    } catch (e) {
      toast({ title: "Kunde inte spara", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList className="h-7">
          <TabsTrigger value="comment" className="text-[11px] h-6">Kommentar</TabsTrigger>
          <TabsTrigger value="note" className="text-[11px] h-6">Anmärkning</TabsTrigger>
          <TabsTrigger value="issue" className="text-[11px] h-6">Avvikelse</TabsTrigger>
        </TabsList>
      </Tabs>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          mode === "comment"
            ? "Skriv kommentar…"
            : mode === "note"
              ? "Vad bör uppmärksammas?"
              : "Vad är problemet och vad behöver göras?"
        }
        className="min-h-[64px] text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <ImageIcon className="h-3.5 w-3.5" />
          {file ? file.name.slice(0, 18) : "Bild"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button size="sm" className="h-7 text-[11px] gap-1" onClick={submit} disabled={!body.trim() && !file}>
          <Send className="h-3 w-3" /> Skicka
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Sparas automatiskt som {actor}.</p>
    </div>
  );
}
