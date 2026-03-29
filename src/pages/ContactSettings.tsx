import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Phone } from "lucide-react";
import { toast } from "sonner";

export default function ContactSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    email: "",
    phone: "",
    address: "",
    opening_hours: "",
    additional_info: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["contact-settings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        email: settings.email || "",
        phone: settings.phone || "",
        address: settings.address || "",
        opening_hours: settings.opening_hours || "",
        additional_info: settings.additional_info || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (settings?.id) {
        const { error } = await supabase
          .from("contact_settings")
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contact_settings").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Contact settings saved");
      queryClient.invalidateQueries({ queryKey: ["contact-settings-admin"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-xs text-muted-foreground animate-pulse p-4">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Phone className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Contact & Support Settings</h1>
      </div>
      <p className="text-xs text-muted-foreground">These details are shown on the investor portal Contact page.</p>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Email</label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-8 text-xs" placeholder="info@company.com" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Phone</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" placeholder="+46 31 123 45 67" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground">Address</label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="h-8 text-xs" placeholder="Street, City, Country" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground">Opening Hours</label>
              <Textarea value={form.opening_hours} onChange={e => setForm({ ...form, opening_hours: e.target.value })} className="text-xs min-h-[60px]" placeholder="Mon–Fri: 09:00 – 17:00" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] text-muted-foreground">Additional Information</label>
              <Textarea value={form.additional_info} onChange={e => setForm({ ...form, additional_info: e.target.value })} className="text-xs min-h-[60px]" placeholder="Any extra information for investors..." />
            </div>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-8 text-xs">
            {saveMutation.isPending ? "Saving..." : "Save Contact Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
