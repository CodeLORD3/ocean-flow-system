import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLandingSettings, type LandingSettings as LS } from "@/hooks/useLandingSettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, Loader2, Upload, RotateCcw } from "lucide-react";
import {
  LandingView,
  HEADLINE_FONTS,
  HEADLINE_COLORS,
  HEADLINE_WEIGHTS,
} from "@/components/landing/LandingView";

type Draft = Omit<LS, "id">;

export default function LandingSettings() {
  const { data, loading, update } = useLandingSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (data) {
      const { id, ...rest } = data;
      setDraft(rest);
    }
  }, [data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty = !!data && !!draft && (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== data[k]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    const err = await update(draft);
    setSaving(false);
    if (err) toast({ title: "Kunde inte spara", variant: "destructive" });
    else toast({ title: "Sparat", description: "Inloggningssidan är uppdaterad." });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `landing/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (error) {
      toast({ title: "Kunde inte ladda upp bilden", variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    set("logo_url", urlData.publicUrl);
  };

  if (loading || !draft) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inloggningssida</h1>
          <p className="text-sm text-muted-foreground">
            Redigera bild och text på makrilltrade.com – förhandsvisningen uppdateras direkt.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Spara
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Controls */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Bild</h2>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-lg border border-border flex items-center justify-center overflow-hidden bg-muted/30">
                {draft.logo_url ? (
                  <img src={draft.logo_url} alt="Logotyp" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-muted-foreground text-center px-1">Standard</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Upload className="h-3.5 w-3.5 mr-2" />}
                  Ladda upp bild
                </Button>
                {draft.logo_url && (
                  <Button variant="ghost" size="sm" onClick={() => set("logo_url", null)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-2" /> Återställ standard
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </div>
            <div>
              <Label className="text-xs">Bildstorlek: {draft.logo_size} px</Label>
              <Slider
                className="mt-2"
                min={40}
                max={260}
                step={4}
                value={[draft.logo_size]}
                onValueChange={([v]) => set("logo_size", v)}
              />
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Rubrik</h2>
            <div>
              <Label htmlFor="headline" className="text-xs">Text</Label>
              <Textarea
                id="headline"
                value={draft.headline}
                onChange={(e) => set("headline", e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="subheadline" className="text-xs">Underrubrik (valfri)</Label>
              <Textarea
                id="subheadline"
                value={draft.subheadline ?? ""}
                onChange={(e) => set("subheadline", e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Typsnitt</Label>
                <Select value={draft.headline_font} onValueChange={(v) => set("headline_font", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEADLINE_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className={f.className}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tjocklek</Label>
                <Select value={String(draft.headline_weight)} onValueChange={(v) => set("headline_weight", Number(v))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HEADLINE_WEIGHTS.map((w) => (
                      <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Textfärg</Label>
              <Select value={draft.headline_color} onValueChange={(v) => set("headline_color", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEADLINE_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Textstorlek: {draft.headline_size} px</Label>
              <Slider
                className="mt-2"
                min={18}
                max={80}
                step={1}
                value={[draft.headline_size]}
                onValueChange={([v]) => set("headline_size", v)}
              />
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Inloggningskort</h2>
            <div>
              <Label htmlFor="card_title" className="text-xs">Titel</Label>
              <Input
                id="card_title"
                value={draft.card_title ?? ""}
                onChange={(e) => set("card_title", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="card_subtitle" className="text-xs">Beskrivning</Label>
              <Textarea
                id="card_subtitle"
                value={draft.card_subtitle ?? ""}
                onChange={(e) => set("card_subtitle", e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </Card>
        </div>

        {/* Live preview */}
        <Card className="p-4 lg:sticky lg:top-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Förhandsvisning</h2>
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
          <div className="rounded-lg border border-border bg-background p-6 overflow-hidden">
            <LandingView
              settings={draft}
              scale={0.75}
              footer={
                <p className="mt-5 text-[10px] text-muted-foreground">
                  © {new Date().getFullYear()} Makrill Trade
                </p>
              }
            >
              <div className="space-y-3 pointer-events-none select-none">
                <div className="space-y-1.5">
                  <Label className="text-xs">E-post</Label>
                  <Input readOnly placeholder="namn@makrilltrade.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lösenord</Label>
                  <Input readOnly type="password" placeholder="••••••••" />
                </div>
                <Button type="button" className="w-full">Logga in</Button>
                <p className="text-center text-xs text-muted-foreground underline">Glömt lösenord?</p>
              </div>
            </LandingView>
          </div>
        </Card>
      </div>
    </div>
  );
}
