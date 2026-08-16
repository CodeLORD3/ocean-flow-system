import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Save, Store as StoreIcon, Factory, Shield, Building2, Globe2 } from "lucide-react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStores } from "@/hooks/useStores";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import { ROLE_DEFS, roleDef, type RoleKey } from "@/lib/roles";
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

function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants" as any)
        .select("id, name, type, active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function StaffAccessDialog({ open, onOpenChange, staff }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: stores = [] } = useStores(true);
  const { data: entities = [] } = useLegalEntities();
  const { data: tenants = [] } = useTenants();
  const retailStores = stores.filter((s: any) => !s.is_wholesale);

  const regions = useMemo(() => {
    const tags = new Set<string>();
    (entities as any[]).forEach((e) => e.country_tag && tags.add(e.country_tag));
    return Array.from(tags).sort();
  }, [entities]);

  const [role, setRole] = useState<RoleKey | "">("");
  const [portals, setPortals] = useState<PortalKey[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [allStores, setAllStores] = useState(true);
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [regionTags, setRegionTags] = useState<string[]>([]);

  useEffect(() => {
    if (!staff) return;
    const access: PortalKey[] = staff.portal_access ?? [];
    const platform = !!staff.is_platform_admin || staff.primary_role === "platform_admin";
    setIsSuperAdmin(platform || access.includes("admin"));
    setPortals(access.filter((p: PortalKey) => p !== "admin"));
    setRole((staff.primary_role as RoleKey) ?? "");
    const ids: string[] = [
      ...(staff.allowed_store_ids ?? []),
      ...(staff.allowed_store_id ? [staff.allowed_store_id] : []),
    ];
    const unique = Array.from(new Set(ids));
    setAllStores(unique.length === 0);
    setStoreIds(unique);
    setTenantIds(staff.allowed_tenant_ids ?? []);
    setCompanyIds(staff.allowed_company_ids ?? []);
    setRegionTags(staff.allowed_region_tags ?? []);
  }, [staff]);

  const togglePortal = (key: PortalKey) =>
    setPortals((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  const toggleIn = (setter: (fn: (prev: string[]) => string[]) => void) => (v: string) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const toggleStore = toggleIn(setStoreIds);
  const toggleTenant = toggleIn(setTenantIds);
  const toggleCompany = toggleIn(setCompanyIds);
  const toggleRegion = toggleIn(setRegionTags);

  const def = roleDef(role || null);

  // Roll väljs → föreslå portaler och rensa scopes som rollen inte använder.
  const pickRole = (key: RoleKey) => {
    setRole(key);
    const d = roleDef(key)!;
    setIsSuperAdmin(key === "platform_admin");
    setPortals(d.portals.filter((p) => p !== "admin") as PortalKey[]);
    if (d.scope !== "store") { setStoreIds([]); setAllStores(true); }
    if (d.scope !== "company") setCompanyIds([]);
    if (d.scope !== "region") setRegionTags([]);
    if (d.scope !== "tenant") setTenantIds(key === "platform_admin" ? [] : tenantIds);
  };

  const [saving, setSaving] = useState(false);

  // Roll + scopes skrivs via databasfunktionen — enda vägen in.
  const handleSave = async () => {
    if (!staff) return;
    const access: PortalKey[] = isSuperAdmin
      ? (["admin", "wholesale", "production", "shop"] as PortalKey[])
      : portals;
    const finalStoreIds = isSuperAdmin || allStores || !access.includes("shop") ? [] : storeIds;
    const scope = def?.scope;

    setSaving(true);
    const { error } = await supabase.rpc("set_user_access", {
      _staff_id: staff.id,
      _role: role || null,
      _portals: access,
      _tenant_ids: scope === "tenant" ? tenantIds : [],
      _company_ids: scope === "company" ? companyIds : [],
      _region_tags: scope === "region" ? regionTags : [],
      _store_ids: finalStoreIds,
    } as any);
    setSaving(false);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["staff"] });
    toast({
      title: "Behörigheter uppdaterade",
      description: `${staff.first_name} ${staff.last_name}${def ? ` — ${def.label}` : ""}`,
    });
    onOpenChange(false);
  };

  const shopEnabled = isSuperAdmin || portals.includes("shop");
  const scope = def?.scope;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Roll & behörigheter
          </DialogTitle>
          <DialogDescription className="text-xs">
            {staff ? `${staff.first_name} ${staff.last_name}` : ""} — välj roll, vilken del av koncernen kontot får se och vilka portaler som öppnas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Roll */}
          <div className="space-y-2">
            <Label className="text-xs">Roll</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {ROLE_DEFS.map((r) => {
                const active = role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => pickRole(r.key)}
                    className={`text-left rounded-md border p-2.5 transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      {r.label}
                      {active && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Valdt</Badge>}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{r.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Koncern (tenant) */}
          {scope === "tenant" && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Globe2 className="h-3 w-3 text-primary" /> Koncerner
              </Label>
              <div className="grid grid-cols-1 gap-1.5">
                {(tenants as any[]).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer text-xs">
                    <Checkbox checked={tenantIds.includes(t.id)} onCheckedChange={() => toggleTenant(t.id)} />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Region */}
          {scope === "region" && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Globe2 className="h-3 w-3 text-primary" /> Länder
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 cursor-pointer text-xs">
                    <Checkbox checked={regionTags.includes(tag)} onCheckedChange={() => toggleRegion(tag)} />
                    <span>{tag}</span>
                  </label>
                ))}
                {regions.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Inga länder märkta på bolagen ännu.</p>
                )}
              </div>
            </div>
          )}

          {/* Bolag */}
          {scope === "company" && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary" /> Bolag
              </Label>
              <div className="grid grid-cols-1 gap-1.5">
                {(entities as any[]).map((e) => (
                  <label key={e.legal_entity_id} className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={companyIds.includes(e.legal_entity_id)}
                      onCheckedChange={() => toggleCompany(e.legal_entity_id)}
                    />
                    <span className="truncate">{e.legal_name}</span>
                    {e.country_tag && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">{e.country_tag}</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Plattform */}
          {scope === "platform" && (
            <div className="rounded-md border border-border p-2.5">
              <p className="text-[10px] text-muted-foreground">
                Plattformsadmin ser samtliga koncerner, bolag och butiker. Inga scopes behöver väljas.
              </p>
            </div>
          )}

          {/* Portals */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Portaler</Label>
              {scope !== "platform" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Full admin</span>
                  <Switch checked={isSuperAdmin} onCheckedChange={setIsSuperAdmin} />
                </div>
              )}
            </div>
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
            {def && <Badge variant="secondary" className="text-[10px]">{def.label}</Badge>}
            {isSuperAdmin ? (
              <Badge variant="secondary" className="text-[10px]">Full admin</Badge>
            ) : portals.length === 0 ? (
              <Badge variant="outline" className="text-[10px]">Ingen portalåtkomst</Badge>
            ) : (
              portals.map((p) => (
                <Badge key={p} variant="secondary" className="text-[10px]">
                  {PORTAL_OPTIONS.find((o) => o.key === p)?.label ?? p}
                </Badge>
              ))
            )}
            {scope === "company" && companyIds.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
            ))}
            {scope === "region" && regionTags.map((r) => (
              <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
            ))}
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
