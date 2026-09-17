import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZONE_PALETTE } from "@/lib/mapPalette";
import type { MapZone } from "@/hooks/useStoreMap";
import { Check } from "lucide-react";

/** Vanliga områdestyper i en fiskbutik — håller listan kort och begriplig. */
export const ZONE_KINDS = [
  "Försäljning",
  "Fiskdisk",
  "Beredning",
  "Kök / produktion",
  "Kyl",
  "Frys",
  "Lager",
  "Diskrum",
  "Kontor",
  "Personalutrymme",
  "Entré",
  "Övrigt",
] as const;

type Props = {
  zone: MapZone | null;
  open: boolean;
  isNew: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    zone_kind: string | null;
    area_sqm: number | null;
    color: string;
    description: string | null;
  }) => void;
};

/**
 * Sidopanel som glider in när ett område är färdigmarkerat.
 * Här fyller man i vad området är, hur stort det är och vad man behöver veta.
 */
export default function ZoneDetailsSheet({ zone, open, isNew, saving, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("");
  const [sqm, setSqm] = useState("");
  const [color, setColor] = useState(ZONE_PALETTE[0].color);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!zone || !open) return;
    setName(isNew && zone.name.startsWith("Nytt område") ? "" : zone.name);
    setKind(zone.zone_kind ?? "");
    setSqm(zone.area_sqm != null ? String(zone.area_sqm) : "");
    setColor(zone.color ?? ZONE_PALETTE[0].color);
    setDescription(zone.description ?? "");
  }, [zone?.id, open]);

  const canSave = name.trim().length > 0 && !saving;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-base">{isNew ? "Beskriv området" : "Redigera området"}</SheetTitle>
          <SheetDescription className="text-xs">
            Fyll i vad området är. Namnet syns i kartan, i uppgifter och på bilder.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-5 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">1. Namn på området</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Fiskdisk, Beredning, Kylrum 2"
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">2. Vad används området till</Label>
            <Select value={kind || "none"} onValueChange={(v) => setKind(v === "none" ? "" : v)}>
              <SelectTrigger className="h-11 text-sm">
                <SelectValue placeholder="Välj typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen typ</SelectItem>
                {ZONE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">3. Yta i kvadratmeter</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={sqm}
              onChange={(e) => setSqm(e.target.value)}
              placeholder="T.ex. 18,5"
              className="h-11 text-base tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Uppmätt yta gör att kartans skala och övriga ytor räknas rätt.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">4. Färg i kartan</Label>
            <div className="flex flex-wrap gap-2">
              {ZONE_PALETTE.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => setColor(p.color)}
                  className="grid h-9 w-9 place-items-center rounded-full border-2 shadow-sm"
                  style={{
                    background: p.color,
                    borderColor: color.toLowerCase() === p.color.toLowerCase() ? "hsl(var(--foreground))" : "transparent",
                  }}
                >
                  {color.toLowerCase() === p.color.toLowerCase() && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">5. Vad behöver man veta här</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="T.ex. Kyl 0–2 °C. Isbädd byts varje morgon. Nyckel hänger vid kontoret."
              className="text-sm"
            />
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-card px-5 py-3">
          <Button
            className="h-12 w-full text-base font-semibold"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                zone_kind: kind || null,
                area_sqm: sqm.trim() === "" ? null : Number(sqm.replace(",", ".")),
                color,
                description: description.trim() || null,
              })
            }
          >
            {saving ? "Sparar…" : "Spara området"}
          </Button>
          {!name.trim() && (
            <p className="pt-1.5 text-center text-[11px] text-muted-foreground">Ge området ett namn för att spara.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
