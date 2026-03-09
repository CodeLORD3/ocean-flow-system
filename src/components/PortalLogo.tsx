import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LucideIcon, Camera } from "lucide-react";
import { useUpdateStore } from "@/hooks/useStores";

interface PortalLogoProps {
  portalName: string;
  fallbackIcon: LucideIcon;
  iconColorClass: string;
  iconBgClass: string;
  title: string;
  subtitle: string;
  collapsed: boolean;
  storeId?: string | null;
  storeLogoUrl?: string | null;
}

export function PortalLogo({
  portalName,
  fallbackIcon: FallbackIcon,
  iconColorClass,
  iconBgClass,
  title,
  subtitle,
  collapsed,
  storeId,
  storeLogoUrl,
}: PortalLogoProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const updateStore = useUpdateStore();

  useEffect(() => {
    if (storeId) {
      setLogoUrl(storeLogoUrl || null);
    } else {
      supabase
        .from("portal_settings")
        .select("logo_url")
        .eq("portal_name", portalName)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.logo_url) setLogoUrl(data.logo_url);
        });
    }
  }, [portalName, storeId, storeLogoUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const path = `${portalName}/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Kunde inte ladda upp logotypen");
      return;
    }

    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    const url = urlData.publicUrl;

    const { error: upsertError } = await supabase
      .from("portal_settings")
      .upsert(
        { portal_name: portalName, logo_url: url, updated_at: new Date().toISOString() },
        { onConflict: "portal_name" }
      );

    if (upsertError) {
      toast.error("Kunde inte spara logotypen");
      return;
    }

    setLogoUrl(url);
    toast.success("Logotyp uppdaterad!");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer overflow-hidden ${iconBgClass}`}
        onClick={() => fileInputRef.current?.click()}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        title="Klicka för att byta logotyp"
      >
        {logoUrl ? (
          <img src={logoUrl} alt={title} className="h-full w-full object-contain" />
        ) : (
          <FallbackIcon className={`h-5 w-5 ${iconColorClass}`} />
        )}
        {hovering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <Camera className="h-4 w-4 text-white" />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
      {!collapsed && (
        <div>
          <h2 className="font-heading text-sm font-bold text-sidebar-accent-foreground">{title}</h2>
          <p className="text-[10px] text-sidebar-foreground/60">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
