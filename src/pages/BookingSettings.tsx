import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Store as StoreIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/SiteContext";
import { useBookingStores, useUpdateBookingStore } from "@/hooks/useBookingAdmin";

const DEFAULT_MESSAGE =
  "Bokningen är tillfälligt stängd i den här butiken. Ring oss gärna, vi hjälper dig direkt.";

/**
 * Butiksinställning för bokningssidan.
 *
 * Butikschefen ser sin egen butik, admin ser alla. Stängd butik tar bort
 * bokningsknappen på bokafiskskaldjur.se och visar meddelandet i stället.
 */
export default function BookingSettings() {
  const { site, activeStoreId } = useSite();
  const isShop = site === "shop";
  const { data: stores = [], isLoading } = useBookingStores(isShop ? activeStoreId : null);
  const update = useUpdateBookingStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const toggle = (id: string, name: string, open: boolean) =>
    update.mutate(
      { id, name, booking_open: open },
      {
        onSuccess: () =>
          toast({ title: open ? "Bokningen är öppen" : "Bokningen är stängd", description: name }),
        onError: (e: any) =>
          toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );

  const saveMessage = (id: string, name: string, text: string) =>
    update.mutate(
      { id, name, booking_closed_message: text.trim() || null },
      {
        onSuccess: () => toast({ title: "Meddelandet sparat", description: name }),
        onError: (e: any) =>
          toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">Bokningsinställningar</h1>
        <p className="text-xs text-muted-foreground">
          Stängd bokning visas direkt för kunden på bokningssidan. Butikspersonal kan fortfarande
          boka åt kund per telefon.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Läser butiker…</p>
      ) : stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen butik kopplad till bokningssidan.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {stores.map((s) => {
            const open = s.booking_open !== false;
            const value = drafts[s.id] ?? s.booking_closed_message ?? "";
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <StoreIcon className="h-4 w-4 text-primary" /> {s.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={open ? "secondary" : "destructive"}>
                        {open ? "Öppen" : "Stängd"}
                      </Badge>
                      <Switch
                        checked={open}
                        onCheckedChange={(v) => toggle(s.id, s.name, v)}
                        aria-label={`Bokning öppen: ${s.name}`}
                      />
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    className="min-h-[80px] text-sm"
                    placeholder={DEFAULT_MESSAGE}
                    value={value}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Visas på bokningssidan när butiken är stängd.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => saveMessage(s.id, s.name, value)}
                    >
                      <Save className="mr-2 h-4 w-4" /> Spara meddelande
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
