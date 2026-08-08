import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useSite } from "@/contexts/SiteContext";
import { logActivity } from "@/hooks/useActivityLog";
import { toast } from "sonner";

/**
 * Liten flytande knapp som sparar en felrapport i activity_logs
 * med sida, tidpunkt, användare och fritext.
 */
export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const location = useLocation();
  const { staff } = useStaffAuth();
  const { site, activeStoreId, activeStoreName } = useSite();

  const who = staff ? `${staff.first_name} ${staff.last_name}`.trim() : "Okänd användare";

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await logActivity({
        action_type: "bug_report",
        description: `Felrapport från ${who} på ${location.pathname}: ${text.trim()}`,
        portal: site || "wholesale",
        store_id: activeStoreId ?? null,
        entity_type: "bug_report",
        performed_by: who,
        details: {
          page: location.pathname,
          reported_at: now,
          user: who,
          user_email: staff?.email ?? null,
          staff_id: staff?.id ?? null,
          portal: site ?? null,
          store: activeStoreName ?? null,
          text: text.trim(),
          user_agent: navigator.userAgent,
        },
      });
      toast.success("Tack! Felrapporten är sparad.");
      setText("");
      setOpen(false);
    } catch (e) {
      toast.error("Kunde inte spara felrapporten. Försök igen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 h-9 gap-1.5 px-3 text-[11px] shadow-lg bg-card"
        >
          <Bug className="h-3.5 w-3.5" />
          Rapportera fel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Rapportera fel</DialogTitle>
          <DialogDescription className="text-xs">
            Beskriv vad som hände. Vi sparar automatiskt sida, tidpunkt och vem som rapporterar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5">
            <div>Sida: {location.pathname}</div>
            <div>Användare: {who}</div>
            <div>Portal: {site === "shop" ? `Butik – ${activeStoreName ?? "–"}` : site === "production" ? "Grossist" : "Admin"}</div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Vad försökte du göra, och vad gick fel?"
            rows={5}
            className="text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button size="sm" className="text-xs" disabled={!text.trim() || saving} onClick={submit}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Skicka
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
