import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Map } from "lucide-react";
import { toast } from "sonner";
import { useMapSettings, useUpdateMapSettings } from "@/hooks/useMapSettings";

export default function MapSettings() {
  const { data: settings, isLoading } = useMapSettings();
  const updateSettings = useUpdateMapSettings();

  const [longitude, setLongitude] = useState("15");
  const [latitude, setLatitude] = useState("54");
  const [scale, setScale] = useState("320");

  useEffect(() => {
    if (settings) {
      setLongitude(String(settings.center_longitude));
      setLatitude(String(settings.center_latitude));
      setScale(String(settings.scale));
    }
  }, [settings]);

  const handleSave = () => {
    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);
    const sc = parseFloat(scale);
    if (isNaN(lon) || isNaN(lat) || isNaN(sc)) {
      toast.error("Please enter valid numbers");
      return;
    }
    updateSettings.mutate(
      { center_longitude: lon, center_latitude: lat, scale: sc },
      {
        onSuccess: () => toast.success("Map settings saved"),
        onError: () => toast.error("Failed to save map settings"),
      }
    );
  };

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Map className="h-5 w-5" /> Map Viewport Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the investor portal map center and zoom level.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Center & Zoom</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="0.1"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="15"
              />
              <p className="text-[10px] text-muted-foreground">East/West (−180 to 180)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="0.1"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="54"
              />
              <p className="text-[10px] text-muted-foreground">North/South (−90 to 90)</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Scale (zoom)</Label>
            <Input
              type="number"
              step="10"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              placeholder="320"
            />
            <p className="text-[10px] text-muted-foreground">
              Higher = more zoomed in. Default: 320 for full Europe view.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {updateSettings.isPending ? "Saving…" : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
