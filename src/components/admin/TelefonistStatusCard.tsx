import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, AlertTriangle } from "lucide-react";

type Status = {
  senaste_samtal: string | null; idag: number; avvisade_dygn: number;
  senaste_sms_status: string | null; senaste_sms_tid: string | null; senast_anvand: string | null;
};
const fmt = (v: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Stockholm" }) : "saknas";

export function useTelefonStatus() {
  return useQuery({
    queryKey: ["telefon_status"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (n: string) => Promise<{ data: unknown; error: Error | null }> }).rpc("telefon_status");
      if (error) throw error;
      return data as Status;
    },
    refetchInterval: 60_000,
  });
}

export default function TelefonistStatusCard() {
  const q = useTelefonStatus();
  const s = q.data;
  const larm = (s?.avvisade_dygn ?? 0) > 20;
  return (
    <Card className={larm ? "border-destructive" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {larm ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Phone className="h-4 w-4" />} Telefonist
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
        {q.error ? <p className="text-muted-foreground">Kunde inte läsa status.</p> : (
          <>
            <div>Senaste samtal: <span className="font-mono tabular-nums">{fmt(s?.senaste_samtal ?? null)}</span></div>
            <div>Registrerade i dag: <span className="font-mono tabular-nums">{s?.idag ?? 0}</span></div>
            <div className={larm ? "font-semibold text-destructive" : undefined}>
              Avvisade anrop senaste dygnet: <span className="font-mono tabular-nums">{s?.avvisade_dygn ?? 0}</span>{larm && " — över 20, kontrollera"}
            </div>
            <div>Senaste sms: {s?.senaste_sms_status ?? "saknas"}{s?.senaste_sms_tid ? ` (${fmt(s.senaste_sms_tid)})` : ""}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
