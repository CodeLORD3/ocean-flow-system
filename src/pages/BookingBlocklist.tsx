import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Ban, Search, ShieldOff, Trash2, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  BlockedCustomer,
  useBlockAudit,
  useBlockedCustomers,
  useSetCustomerBlocked,
  useAnonymizeCustomer,
} from "@/hooks/useBookingAdmin";

const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—";

const label = (c: BlockedCustomer) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.name || "Kund";

/**
 * Spärrlista för bokningssidan.
 *
 * Spärr och hävning är alltid ett manuellt beslut — inget räknas upp
 * automatiskt till spärr. Uteblivna hämtningar syns som underlag.
 */
export default function BookingBlocklist() {
  const { staff } = useStaffAuth();
  const actorName = [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useBlockedCustomers(search);
  const audit = useBlockAudit();
  const setBlocked = useSetCustomerBlocked();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const anonymize = useAnonymizeCustomer();

  /** Radering på begäran: personuppgifterna tas bort, orderhistoriken behålls avidentifierad. */
  const erase = (c: BlockedCustomer) => {
    anonymize.mutate(
      { customerId: c.id, reason: reasons[c.id] ?? "" },
      {
        onSuccess: (res) =>
          toast({
            title: "Kunduppgifterna är raderade",
            description: `${res?.orders_anonymized ?? 0} ordrar avidentifierade, telefonnummer rensade ur SMS-loggen.`,
          }),
        onError: (e: any) =>
          toast({ title: "Kunde inte radera", description: e.message, variant: "destructive" }),
      },
    );
  };

  const act = (customer: BlockedCustomer, blocked: boolean) => {
    const reason = reasons[customer.id] ?? "";
    if (blocked && !reason.trim()) {
      toast({ title: "Ange orsak", description: "Spärren måste kunna förklaras.", variant: "destructive" });
      return;
    }
    setBlocked.mutate(
      { customer, blocked, reason, actorName },
      {
        onSuccess: () => {
          toast({ title: blocked ? "Numret är spärrat" : "Spärren är hävd", description: customer.phone ?? label(customer) });
          setReasons((r) => ({ ...r, [customer.id]: "" }));
        },
        onError: (e: any) =>
          toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );
  };

  const blocked = data?.blocked ?? [];
  const candidates = (data?.matches ?? []).filter((c) => !c.booking_blocked);

  const card = (c: BlockedCustomer, isBlocked: boolean) => (
    <div key={c.id} className="space-y-2 border-b border-grid-line p-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-medium">{label(c)}</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">{c.phone ?? "utan nummer"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={Number(c.no_show_count ?? 0) > 0 ? "destructive" : "outline"} className="font-mono tabular-nums">
            {Number(c.no_show_count ?? 0)} uteblivna
          </Badge>
          {isBlocked && <Badge variant="destructive">Spärrad</Badge>}
        </div>
      </div>
      {isBlocked && (
        <p className="text-xs text-muted-foreground">
          Spärrad {fmtTime(c.booking_blocked_at)}
          {c.booking_block_reason ? ` — ${c.booking_block_reason}` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-8 max-w-sm text-xs"
          placeholder={isBlocked ? "Orsak till hävning (frivilligt)" : "Orsak till spärr (krävs)"}
          value={reasons[c.id] ?? ""}
          onChange={(e) => setReasons((r) => ({ ...r, [c.id]: e.target.value }))}
        />
        <Button
          size="sm"
          variant={isBlocked ? "outline" : "destructive"}
          disabled={setBlocked.isPending}
          onClick={() => act(c, !isBlocked)}
        >
          {isBlocked ? (
            <>
              <Undo2 className="mr-2 h-4 w-4" /> Häv spärr
            </>
          ) : (
            <>
              <Ban className="mr-2 h-4 w-4" /> Spärra
            </>
          )}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={anonymize.isPending}>
              <Trash2 className="mr-2 h-4 w-4" /> Radera kunduppgifter
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Radera kunduppgifter på begäran?</AlertDialogTitle>
              <AlertDialogDescription>
                Namn, telefon, e-post och adress för {label(c)} tas bort permanent. Orderhistoriken
                behålls avidentifierad så att bokföring och statistik stämmer. Går inte att ångra.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={() => erase(c)}>Radera</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldOff className="h-5 w-5 text-destructive" /> Spärrlista bokning
        </h1>
        <p className="text-xs text-muted-foreground">
          Här sköts också radering av kunduppgifter på begäran (GDPR) — sök fram kunden nedan.
          Ett spärrat nummer får normalt svar utåt när det ber om kod, men ingen kod skickas och
          ingen bokning kan skapas. Varje beslut loggas med vem och när.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Sök namn, telefon eller e-post för att spärra"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className={blocked.length ? "border-destructive/60" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            Spärrade kunder
            <Badge variant={blocked.length ? "destructive" : "secondary"}>{blocked.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Läser spärrlistan…</p>
          ) : !blocked.length ? (
            <p className="p-4 text-sm text-muted-foreground">Ingen kund är spärrad.</p>
          ) : (
            blocked.map((c) => card(c, true))
          )}
        </CardContent>
      </Card>

      {search.trim().length >= 3 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sökträffar att spärra</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!candidates.length ? (
              <p className="p-4 text-sm text-muted-foreground">Ingen ospärrad kund matchar sökningen.</p>
            ) : (
              candidates.map((c) => card(c, false))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Beslutslogg</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!audit.data?.length ? (
            <p className="p-4 text-sm text-muted-foreground">Inga spärrbeslut loggade ännu.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2">Tidpunkt</th>
                  <th className="px-3 py-2">Åtgärd</th>
                  <th className="px-3 py-2">Nummer</th>
                  <th className="px-3 py-2">Av</th>
                  <th className="px-3 py-2">Orsak</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((r) => (
                  <tr key={r.id} className="border-t border-grid-line">
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{fmtTime(r.created_at)}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant={r.action === "sparr" ? "destructive" : "secondary"}>
                        {r.action === "sparr" ? "Spärr" : "Hävning"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone_normalized ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.actor_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
