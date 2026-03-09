import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LucideIcon, Camera, Edit2, Check, X } from "lucide-react";
import { useUpdateStore } from "@/hooks/useStores";
import { Input } from "@/components/ui/input";

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
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(title);
  const [editName, setEditName] = useState(title);
  const [hoveringName, setHoveringName] = useState(false);
  const updateStore = useUpdateStore();

  useEffect(() => {
    if (storeId) {
      setLogoUrl(storeLogoUrl || null);
      setDisplayName(title);
    } else {
      supabase
        .from("portal_settings")
        .select("logo_url, display_name")
        .eq("portal_name", portalName)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.logo_url) setLogoUrl(data.logo_url);
          if ((data as any)?.display_name) {
            setDisplayName((data as any).display_name);
          } else {
            setDisplayName(title);
          }
        });
    }
  }, [portalName, storeId, storeLogoUrl, title]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const path = storeId 
      ? `stores/${storeId}/logo-${Date.now()}.${ext}`
      : `${portalName}/logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Kunde inte ladda upp logotypen");
      return;
    }

    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
    const url = urlData.publicUrl;

    if (storeId) {
      updateStore.mutate(
        { id: storeId, logo_url: url },
        {
          onSuccess: () => {
            setLogoUrl(url);
            toast.success("Butikslogotyp uppdaterad!");
          },
          onError: () => toast.error("Kunde inte spara logotypen")
        }
      );
    } else {
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
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleNameSave = async () => {
    if (!editName.trim()) return;
    
    if (storeId) {
      updateStore.mutate(
        { id: storeId, name: editName },
        {
          onSuccess: () => {
            setDisplayName(editName);
            setIsEditingName(false);
            toast.success("Butiksnamn uppdaterat!");
          },
          onError: () => toast.error("Kunde inte spara namnet")
        }
      );
    } else {
      const { error: upsertError } = await supabase
        .from("portal_settings")
        .upsert(
          { 
            portal_name: portalName, 
            display_name: editName,
            updated_at: new Date().toISOString() 
          } as any,
          { onConflict: "portal_name" }
        );

      if (upsertError) {
        toast.error("Kunde inte spara namnet");
        return;
      }

      setDisplayName(editName);
      setIsEditingName(false);
      toast.success("Namn uppdaterat!");
    }
  };

  return (
    <div className="flex items-center gap-3 w-full overflow-hidden">
      <div
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg cursor-pointer overflow-hidden ${iconBgClass}`}
        onClick={() => fileInputRef.current?.click()}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        title="Klicka för att byta logotyp"
      >
        {logoUrl ? (
          <img src={logoUrl} alt={displayName} className="h-full w-full object-contain bg-white" />
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
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm font-bold px-1.5 py-0 w-full bg-sidebar-accent text-sidebar-accent-foreground"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') {
                    setEditName(displayName);
                    setIsEditingName(false);
                  }
                }}
              />
              <button onClick={handleNameSave} className="p-1 hover:bg-sidebar-accent rounded text-primary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => {
                setEditName(displayName);
                setIsEditingName(false);
              }} className="p-1 hover:bg-sidebar-accent rounded text-destructive shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 group cursor-pointer" 
              onClick={() => {
                setEditName(displayName);
                setIsEditingName(true);
              }}
              onMouseEnter={() => setHoveringName(true)}
              onMouseLeave={() => setHoveringName(false)}
              title="Klicka för att byta namn"
            >
              <h2 className="font-heading text-sm font-bold text-sidebar-accent-foreground truncate">
                {displayName}
              </h2>
              {hoveringName && <Edit2 className="h-3 w-3 text-sidebar-foreground/50 shrink-0" />}
            </div>
          )}
          <p className="text-[10px] text-sidebar-foreground/60">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
