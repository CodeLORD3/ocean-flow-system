import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLandingSettings } from "@/hooks/useLandingSettings";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2 } from "lucide-react";

export default function LandingSettings() {
  const { data, loading, update } = useLandingSettings();
  const [headline, setHeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (data) setHeadline(data.headline);
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    const err = await update(headline);
    setSaving(false);
    if (err) toast({ title: "Kunde inte spara", variant: "destructive" });
    else toast({ title: "Sparat", description: "Rubriken på inloggningssidan är uppdaterad." });
  };

  if (loading) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground mb-1">Inloggningssida</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Den här texten visas stort ovanför inloggningsfältet på makrilltrade.com.
      </p>

      <Card className="p-5">
        <Label htmlFor="headline" className="text-xs font-medium">Rubrik</Label>
        <Textarea
          id="headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          rows={3}
          className="mt-2 text-base"
          placeholder="t.ex. Välkommen till Makrill Trade"
        />
        <div className="flex justify-end mt-4">
          <Button onClick={handleSave} disabled={saving || headline === data?.headline}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Spara
          </Button>
        </div>
      </Card>
    </div>
  );
}
