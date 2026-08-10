import { useState } from "react";
import { Users, Check, User } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useStaff } from "@/hooks/useStaff";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
}

/**
 * Koppla personal till en butik.
 *
 * Kopplingen bor i behörigheten (user_scopes): butiksportal + butikslista.
 * Tom butikslista betyder alla butiker — sådana konton visas som låsta här,
 * eftersom de redan har tillgång till samtliga butiker.
 */
export function StoreStaffDialog({ open, onOpenChange, storeId, storeName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: allStaff = [] } = useStaff();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const rows = (allStaff as any[]).filter((s) => {
    const q = search.toLowerCase();
    return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q);
  });

  const toggle = async (s: any, member: boolean) => {
    setSavingId(s.id);
    const { error } = await supabase.rpc("set_store_membership", {
      _staff_id: s.id,
      _store_id: storeId,
      _member: !member,
    });
    setSavingId(null);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["staff"] });
    toast({
      title: member ? "Borttagen från butiken" : "Kopplad till butiken",
      description: `${s.first_name} ${s.last_name} · ${storeName}`,
    });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Personal i {storeName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bocka i vilka som ska vara kopplade till butiken. En person kan vara kopplad till flera butiker.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Sök personal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />

        <div className="space-y-1.5">
          {rows.map((s: any) => {
            const ids: string[] = s.allowed_store_ids ?? [];
            const portals: string[] = s.portal_access ?? [];
            const isSuper = portals.includes("admin");
            const allStores = !isSuper && ids.length === 0 && portals.includes("shop");
            const explicit = ids.includes(storeId);
            const home = s.store_id === storeId;
            const member = explicit || home || allStores || isSuper;
            const locked = isSuper || allStores || home;

            return (
              <div key={s.id} className="flex items-center gap-2.5 rounded-md border border-border p-2">
                <Checkbox
                  checked={member}
                  disabled={locked || savingId === s.id}
                  onCheckedChange={() => toggle(s, explicit || home ? true : false)}
                />
                <div className="h-7 w-7 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
                  {s.profile_image_url ? (
                    <img src={s.profile_image_url} alt={`${s.first_name} ${s.last_name}`} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{s.email || s.workplace || "—"}</p>
                </div>
                {isSuper ? (
                  <Badge variant="secondary" className="text-[9px]">Full admin</Badge>
                ) : allStores ? (
                  <Badge variant="outline" className="text-[9px]">Alla butiker</Badge>
                ) : home ? (
                  <Badge variant="secondary" className="text-[9px]">Hemmabutik</Badge>
                ) : member ? (
                  <Badge variant="secondary" className="text-[9px] gap-1"><Check className="h-2.5 w-2.5" /> Kopplad</Badge>
                ) : null}
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">Ingen personal matchar sökningen.</p>
          )}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Klar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
