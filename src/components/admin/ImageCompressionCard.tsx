import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/** Tabeller vars bildkolumner kan komprimeras i efterhand. */
const TARGETS: { table: string; column: string; label: string }[] = [
  { table: "entity_images", column: "url", label: "Butiks- och produktbilder" },
  { table: "products", column: "image_url", label: "Produktbilder" },
  { table: "staff", column: "profile_image_url", label: "Personalbilder" },
  { table: "chat_messages", column: "image_url", label: "Chattbilder" },
];

interface Progress {
  label: string;
  scanned: number;
  processed: number;
  savedMb: number;
}

/**
 * Engångsjobb som skalar ner redan uppladdade bilder till max 1600 px.
 * Sökvägarna behålls, så bilderna visas exakt som förut — bara mindre.
 */
export default function ImageCompressionCard() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);

  const run = async () => {
    setRunning(true);
    setProgress([]);
    try {
      for (const target of TARGETS) {
        let offset = 0;
        let scanned = 0;
        let processed = 0;
        let savedMb = 0;
        // Körs i omgångar så varje anrop hinner klart innan nästa startar.
        for (let batch = 0; batch < 200; batch++) {
          const { data, error } = await supabase.functions.invoke("compress-stored-images", {
            body: { table: target.table, column: target.column, limit: 10, offset },
          });
          if (error) throw error;
          const res = data as {
            fetched: number;
            processed: number;
            savedMb: number;
            nextOffset: number;
            done: boolean;
          };
          scanned += res.fetched;
          processed += res.processed;
          savedMb += res.savedMb;
          offset = res.nextOffset;
          setProgress((prev) => {
            const next = prev.filter((p) => p.label !== target.label);
            return [...next, { label: target.label, scanned, processed, savedMb }];
          });
          if (res.done) break;
        }
      }
      toast({ title: "Klart", description: "Bilderna är komprimerade." });
    } catch (e) {
      toast({
        title: "Komprimeringen avbröts",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const totalSaved = progress.reduce((sum, p) => sum + p.savedMb, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageDown className="h-4 w-4 text-muted-foreground" />
          Bildkomprimering
          {totalSaved > 0 && <Badge variant="secondary">-{totalSaved.toFixed(1)} MB</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Nya bilder komprimeras redan vid uppladdning. Kör jobbet en gång för att skala ner
          äldre bilder som sparades i full kamerastorlek. Bildernas länkar och utseende ändras
          inte — bara filstorleken.
        </p>
        {progress.length > 0 && (
          <ul className="space-y-1">
            {progress.map((p) => (
              <li key={p.label} className="flex flex-wrap items-center justify-between gap-2">
                <span>{p.label}</span>
                <span className="font-mono tabular-nums text-xs text-muted-foreground">
                  {p.processed}/{p.scanned} komprimerade · -{p.savedMb.toFixed(1)} MB
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={run} disabled={running} size="sm">
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {running ? "Komprimerar…" : "Komprimera gamla bilder"}
        </Button>
      </CardContent>
    </Card>
  );
}
