/**
 * Systemstatus: kortet Leverantörsdokument — visar mejlinloppets hälsa.
 */
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMailMessages, useMailRuns, useSupplierDocuments } from "@/hooks/useSupplierDocuments";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const ageHours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

export function SupplierDocumentsCard() {
  const { data: documents = [] } = useSupplierDocuments();
  const { data: messages = [] } = useMailMessages();
  const { data: runs = [] } = useMailRuns();

  const lastRun = runs[0];
  const lastOk = runs.find((r) => r.ok);
  const silent = !lastOk || ageHours(lastOk.started_at) > 1;

  const fetchedToday = documents.filter((d) => isToday(d.created_at)).length;
  const waiting = documents.filter((d) => d.status === "utkast" && d.parse_status === "tolkad");
  const oldest = waiting.reduce<number>((max, d) => Math.max(max, ageHours(d.created_at)), 0);
  const unknown = messages.filter((m) => m.status === "okand_avsandare").length;
  const parseErrors = documents.filter((d) => d.parse_status === "fel").length;
  const duplicates = documents.filter((d) => d.status === "dubblett").length;

  const rows: { label: string; value: string; alarm?: boolean }[] = [
    { label: "Hämtade idag", value: String(fetchedToday) },
    {
      label: "Väntar på attest",
      value: waiting.length ? `${waiting.length} · äldsta ${Math.round(oldest)} h` : "0",
      alarm: oldest > 48,
    },
    { label: "Okända avsändare", value: String(unknown), alarm: unknown > 0 },
    { label: "Tolkningsfel", value: String(parseErrors), alarm: parseErrors > 0 },
    { label: "Dubbletter stoppade", value: String(duplicates) },
    {
      label: "Olästa mejl utan bilaga",
      value: String(lastRun?.unread_without_attachment ?? 0),
      alarm: (lastRun?.unread_without_attachment ?? 0) > 0,
    },
    {
      label: "Senaste lyckade IMAP-läsning",
      value: lastOk
        ? formatDistanceToNow(new Date(lastOk.started_at), { addSuffix: true, locale: sv })
        : "aldrig",
      alarm: silent,
    },
  ];

  return (
    <Card className={silent || oldest > 48 ? "border-amber-500/60" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="h-4 w-4" /> Leverantörsdokument
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-medium tabular-nums ${r.alarm ? "text-amber-600" : ""}`}>
              {r.alarm && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
              {r.value}
            </span>
          </div>
        ))}
        {lastRun && !lastRun.ok && lastRun.error && (
          <p className="text-[11px] text-destructive pt-1">{lastRun.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default SupplierDocumentsCard;
