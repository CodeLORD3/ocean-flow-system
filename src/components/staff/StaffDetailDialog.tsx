import { useState } from "react";
import { User, Phone, Mail, MapPin, Link2, Unlink, Activity } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateStaff } from "@/hooks/useStaff";
import { StaffActivityPanel } from "./StaffActivityPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: any | null;
}

export function StaffDetailDialog({ open, onOpenChange, staff }: Props) {
  const { toast } = useToast();
  const updateStaff = useUpdateStaff();
  const [linkEmail, setLinkEmail] = useState("");
  const [linking, setLinking] = useState(false);

  if (!staff) return null;

  const handleAutoLink = async () => {
    if (!staff.email) {
      toast({ title: "Saknar e-post", description: "Lägg till e-post på personen för att länka.", variant: "destructive" });
      return;
    }
    setLinking(true);
    try {
      // Look up another staff record sharing this auth user, fall back: cannot read auth.users from client.
      // Best-effort: assume email is correct; trigger via edge function would be ideal,
      // but here we just try to link by checking if any other staff already has user_id with same email.
      const { data } = await supabase
        .from("staff")
        .select("user_id, email")
        .eq("email", staff.email)
        .not("user_id", "is", null)
        .maybeSingle();
      if (data?.user_id) {
        await updateStaff.mutateAsync({ id: staff.id, user_id: data.user_id } as any);
        toast({ title: "Konto länkat", description: `Kopplat till befintligt konto.` });
      } else {
        toast({
          title: "Ingen matchning",
          description: "Hittade inget auth-konto via e-post. Be personen logga in en gång så länkas det automatiskt.",
        });
      }
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleManualLink = async () => {
    if (!linkEmail) return;
    setLinking(true);
    try {
      const { data } = await supabase
        .from("staff")
        .select("user_id")
        .eq("email", linkEmail.trim())
        .not("user_id", "is", null)
        .maybeSingle();
      if (!data?.user_id) {
        toast({
          title: "Hittades inte",
          description: "Inget konto hittades med den e-posten.",
          variant: "destructive",
        });
        return;
      }
      await updateStaff.mutateAsync({ id: staff.id, user_id: data.user_id } as any);
      toast({ title: "Länkat", description: `Personen är nu kopplad till ${linkEmail}` });
      setLinkEmail("");
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    await updateStaff.mutateAsync({ id: staff.id, user_id: null } as any);
    toast({ title: "Avlänkat", description: "Inloggningskoppling borttagen." });
  };

  const fullName = `${staff.first_name} ${staff.last_name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> {fullName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Personlig profil och inloggningsaktivitet
          </DialogDescription>
        </DialogHeader>

        {/* Profile header */}
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
            {staff.profile_image_url ? (
              <img src={staff.profile_image_url} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <User className="h-7 w-7 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-semibold text-foreground">{fullName}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
              {staff.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {staff.email}</span>}
              {staff.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {staff.phone}</span>}
              {staff.workplace && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {staff.workplace}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {staff.user_id ? (
                <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
                  <Link2 className="h-3 w-3 mr-1" /> Konto länkat
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  <Unlink className="h-3 w-3 mr-1" /> Inget inloggningskonto
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Linking controls */}
        {!staff.user_id ? (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Koppla till inloggningskonto</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAutoLink}
                disabled={linking}
                className="text-xs"
              >
                Auto-koppla via e-post
              </Button>
              <div className="flex gap-2 flex-1">
                <Input
                  placeholder="Eller ange annan e-post..."
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" onClick={handleManualLink} disabled={linking || !linkEmail} className="text-xs">
                  Länka
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={handleUnlink} className="text-xs text-muted-foreground">
              <Unlink className="h-3 w-3 mr-1" /> Avlänka konto
            </Button>
          </div>
        )}

        {/* Activity panel */}
        <StaffActivityPanel
          staffId={staff.id}
          userId={staff.user_id}
          staffName={fullName}
        />
      </DialogContent>
    </Dialog>
  );
}
