import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Info, Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  name: string;
  role: string;
  desc: string;
  image_url?: string;
  image_position?: string;
}

interface ValueItem {
  title: string;
  desc: string;
}

export default function AboutSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    hero_title: "About Ocean Trade",
    hero_subtitle: "Who we are and what drives us",
    hero_description: "",
    mission_text: "",
  });
  const [values, setValues] = useState<ValueItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["about-us-settings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("about_us_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        hero_title: settings.hero_title || "About Ocean Trade",
        hero_subtitle: settings.hero_subtitle || "",
        hero_description: settings.hero_description || "",
        mission_text: settings.mission_text || "",
      });
      setValues(Array.isArray(settings.values_json) ? (settings.values_json as unknown as ValueItem[]) : []);
      setTeam(Array.isArray(settings.team_json) ? (settings.team_json as unknown as TeamMember[]) : []);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        values_json: values as any,
        team_json: team as any,
        updated_at: new Date().toISOString(),
      };
      if (settings?.id) {
        const { error } = await supabase
          .from("about_us_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("about_us_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("About Us settings saved");
      queryClient.invalidateQueries({ queryKey: ["about-us-settings-admin"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addValue = () => setValues([...values, { title: "", desc: "" }]);
  const removeValue = (i: number) => setValues(values.filter((_, idx) => idx !== i));
  const updateValue = (i: number, field: keyof ValueItem, v: string) => {
    const copy = [...values];
    copy[i] = { ...copy[i], [field]: v };
    setValues(copy);
  };

  const [uploading, setUploading] = useState<number | null>(null);

  const uploadPhoto = async (i: number, file: File) => {
    setUploading(i);
    const ext = file.name.split(".").pop();
    const path = `team/${Date.now()}_${i}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    const copy = [...team];
    copy[i] = { ...copy[i], image_url: urlData.publicUrl };
    setTeam(copy);
    setUploading(null);
  };

  const addTeamMember = () => setTeam([...team, { name: "", role: "", desc: "" }]);
  const removeTeamMember = (i: number) => setTeam(team.filter((_, idx) => idx !== i));
  const updateTeamMember = (i: number, field: keyof TeamMember, v: string) => {
    const copy = [...team];
    copy[i] = { ...copy[i], [field]: v };
    setTeam(copy);
  };

  if (isLoading) return <div className="text-xs text-muted-foreground animate-pulse p-4">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">About Us Settings</h1>
      </div>
      <p className="text-xs text-muted-foreground">Edit the content shown on the investor portal About Us page.</p>

      {/* Hero section */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Hero Section</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Title</label>
              <Input value={form.hero_title} onChange={e => setForm({ ...form, hero_title: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Subtitle</label>
              <Input value={form.hero_subtitle} onChange={e => setForm({ ...form, hero_subtitle: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground">Description</label>
              <Textarea value={form.hero_description} onChange={e => setForm({ ...form, hero_description: e.target.value })} className="text-xs min-h-[80px]" placeholder="Tell investors about your company..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mission */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Mission Statement</h2>
          <Textarea value={form.mission_text} onChange={e => setForm({ ...form, mission_text: e.target.value })} className="text-xs min-h-[80px]" placeholder="Your company mission..." />
        </CardContent>
      </Card>

      {/* Values */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Company Values</h2>
            <Button variant="outline" size="sm" onClick={addValue} className="h-7 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> Add Value
            </Button>
          </div>
          {values.map((v, i) => (
            <div key={i} className="flex gap-2 items-start p-2 border border-border bg-muted/30">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input value={v.title} onChange={e => updateValue(i, "title", e.target.value)} className="h-7 text-xs" placeholder="Title" />
                <Input value={v.desc} onChange={e => updateValue(i, "desc", e.target.value)} className="h-7 text-xs" placeholder="Description" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeValue(i)} className="h-7 w-7 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {values.length === 0 && <p className="text-xs text-muted-foreground">No values added yet.</p>}
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Leadership Team</h2>
            <Button variant="outline" size="sm" onClick={addTeamMember} className="h-7 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> Add Member
            </Button>
          </div>
          {team.map((m, i) => (
            <div key={i} className="flex gap-2 items-start p-2 border border-border bg-muted/30">
              <div className="shrink-0 flex flex-col items-center gap-1">
                <label className="cursor-pointer">
                  {m.image_url ? (
                    <img src={m.image_url} className="h-12 w-12 rounded-full border border-border" style={{ objectFit: "cover", objectPosition: m.image_position || "center" }} />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center border border-dashed border-border">
                      {uploading === i ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadPhoto(i, e.target.files[0]); }} />
                </label>
                {m.image_url && (
                  <select
                    value={m.image_position || "center"}
                    onChange={e => updateTeamMember(i, "image_position", e.target.value)}
                    className="text-[9px] bg-background border border-border rounded px-1 h-5 w-16 text-center"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top left">Top Left</option>
                    <option value="top right">Top Right</option>
                  </select>
                )}
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Input value={m.name} onChange={e => updateTeamMember(i, "name", e.target.value)} className="h-7 text-xs" placeholder="Name" />
                <Input value={m.role} onChange={e => updateTeamMember(i, "role", e.target.value)} className="h-7 text-xs" placeholder="Role" />
                <Input value={m.desc} onChange={e => updateTeamMember(i, "desc", e.target.value)} className="h-7 text-xs" placeholder="Short bio" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeTeamMember(i)} className="h-7 w-7 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {team.length === 0 && <p className="text-xs text-muted-foreground">No team members added yet.</p>}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-8 text-xs">
        {saveMutation.isPending ? "Saving..." : "Save About Us Settings"}
      </Button>
    </div>
  );
}
