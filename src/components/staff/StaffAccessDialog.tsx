import { useEffect, useState } from "react";
import { ShieldCheck, Save, Store as StoreIcon, Factory, Shield } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useStores } from "@/hooks/useStores";
import type { PortalKey } from "@/contexts/StaffAuthContext";

export const PORTAL_OPTIONS: { key: PortalKey; label: string; description: string; icon: typeof Shield }[] = [
  { key: "wholesale", label: "Admin", description: "Administrationsportalen (organisation, personal, rapporter)", icon: Shield },
  { key: "production", label: "Grossist", description: "Grossistportalen (inköp, produktion, lager)", icon: Factory },
  { key: "shop", label: "Butik", description: "Butiksportalerna — välj vilka butiker nedan", icon: StoreIcon },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any | null;
}

export function StaffAccessDialog({ open, onOpenChange, staff }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stores = [] } = useStores(true);
  const retailStores = stores.filter((s: any) => !s.is_wholesale);

  const [portals, setPortals] = useState<PortalKey[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [allStores, setAllStores] = useState(true);

  useEffect(() => {
    if (!staff) return;
    const access: PortalKey[] = staff.portal_access ?? [];
    setIsSuperAdmin(access.includes("admin"));
    setPortals(access.filter((p) => p !== "admin"));
    const ids: string[] = [
      ...(staff.allowed_store_ids ?? []),
      ...(staff.allowed_store_id ? [staff.allowed_store_id] : []),
    ];
    const unique = Array.from(new Set(ids));
    setAllStores(unique.length === 0);
    setStoreIds(unique);
  }, [staff]);

  const togglePortal = (key: PortalKey) =>
    setPortals((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const toggleStore = (id: string) =>
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const [saving, setSaving] = useState(false);

  // Behörigheten skrivs till user_scopes via databasfunktionen — enda vägen in.
  const handleSave = async () => {
    if (!staff) return;
    const access: PortalKey[] = isSuperAdmin
      ? (["admin", "wholesale", "production", "shop"] as PortalKey[])
      : portals;
    const finalStoreIds = isSuperAdmin || allStores || !access.includes("shop") ? [] : storeIds;

    setSaving(true);
    const { error } = await supabase.rpc("set_user_scopes", {
      _staff_id: staff.id,
      _portals: access,
      _store_ids: finalStoreIds,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["staff"] });
    toast({
      title: "Behörigheter uppdaterade",
      description: `${staff.first_name} ${staff.last_name}`,
    });
    onOpenChange(false);
  };

  const shopEnabled = isSuperAdmin || portals.includes("shop");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Behörigheter
          </DialogTitle>
          <DialogDescription className="text-xs">
            {staff ? `${staff.first_name} ${staff.last_name}` : ""} — välj vilka portaler och butiker kontot får använda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Super admin */}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Full administratörsbehörighet</p>
              <p className="text-[10px] text-muted-foreground">
                Ger åtkomst till alla portaler och alla butiker automatiskt.
              </p>
            </div>
            <Switch checked={isSuperAdmin} onCheckedChange={setIsSuperAdmin} />
          </div>

          {/* Portals */}
          <div className="space-y-2">
            <Label className="text-xs">Portaler</Label>
            {PORTAL_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const checked = isSuperAdmin || portals.includes(opt.key);
              return (
                <div
                  key={opt.key}
                  className={`flex items-start gap-3 rounded-md border border-border p-2.5 ${isSuperAdmin ? "opacity-60" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={isSuperAdmin}
                    onCheckedChange={() => togglePortal(opt.key)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Icon className="h-3 w-3 text-primary" /> {opt.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stores */}
          {shopEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Butiker</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Alla butiker</span>
                  <Switch
                    checked={isSuperAdmin || allStores}
                    disabled={isSuperAdmin}
                    onCheckedChange={setAllStores}
                  />
                </div>
              </div>
              {!(isSuperAdmin || allStores) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {retailStores.map((st: any) => (
                    <label
                      key={st.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={storeIds.includes(st.id)}
                        onCheckedChange={() => toggleStore(st.id)}
                      />
                      <span className="truncate">{st.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {(isSuperAdmin || allStores) && (
                <p className="text-[10px] text-muted-foreground">
                  Kontot får tillgång till samtliga {retailStores.length} butiker.
                </p>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {isSuperAdmin ? (
              <Badge variant="secondary" className="text-[10px]">Full admin</Badge>
            ) : portals.length === 0 ? (
              <Badge variant="outline" className="text-[10px]">Ingen åtkomst</Badge>
            ) : (
              portals.map((p) => (
                <Badge key={p} variant="secondary" className="text-[10px]">
                  {PORTAL_OPTIONS.find((o) => o.key === p)?.label ?? p}
                </Badge>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3 w-3 mr-1.5" /> Spara behörigheter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
