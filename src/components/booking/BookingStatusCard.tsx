import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Globe, Phone } from "lucide-react";
import { useBookingStatus } from "@/hooks/useBookingAdmin";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("sv-SE");
const kr = (v: unknown) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Larmgräns för OTP-genomförandegraden. */
const OTP_ALARM = 0.85;
/** Larmgräns för onormal SMS-volym på ett dygn. */
const SMS_ALARM = 300;

/**
 * Bokningssidan — dagens siffror.
 *
 * Kortet är byggt för att kunna läsas på tio sekunder: allt som larmar får röd
 * text och en textad förklaring, aldrig färg som enda bärare.
 */
export default function BookingStatusCard() {
  const { data, isLoading, error } = useBookingStatus();

  const otpRate = data?.otp?.rate != null ? Number(data.otp.rate) : null;
  const otpAlarm = otpRate != null && data!.otp.codes_sent >= 5 && otpRate < OTP_ALARM;
  const smsAlarm = Number(data?.sms?.total ?? 0) > SMS_ALARM;
  const smsErrors = Number(data?.sms?.errors ?? 0);
  const remindersFailed = Number(data?.reminders_failed ?? 0);
  const failedBookings = Number(data?.failed_bookings ?? 0);
  const guard = data?.guard ?? [];
  const guardHits = guard
    .filter((g) => g.kind === "honeypot" || g.kind === "tidsfalla" || g.kind.startsWith("rate_limit"))
    .reduce((s, g) => s + Number(g.count), 0);

  const anyAlarm = otpAlarm || smsAlarm || smsErrors > 0 || remindersFailed > 0;

  return (
    <Card className={anyAlarm ? "border-destructive" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {anyAlarm ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          Bokningssidan — {data?.day ?? "idag"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Läser bokningsstatus…</p>
        ) : error ? (
          <p className="text-destructive">Kunde inte läsa bokningsstatusen.</p>
        ) : (
          <>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-2 py-1">Butik</th>
                    <th className="px-2 py-1 text-right">Webb</th>
                    <th className="px-2 py-1 text-right">Per telefon</th>
                    <th className="px-2 py-1 text-right">Totalt</th>
                  </tr>
                </thead>
                <tbody>
                  {!data?.per_store?.length ? (
                    <tr>
                      <td className="px-2 py-2 text-muted-foreground" colSpan={4}>
                        Inga bokningar idag.
                      </td>
                    </tr>
                  ) : (
                    data.per_store.map((s) => (
                      <tr key={s.store_id} className="border-t">
                        <td className="px-2 py-1">{s.store_name}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3 w-3 text-muted-foreground" /> {n(s.web)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" /> {n(s.phone)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{n(s.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-2">
                <p className="text-[11px] text-muted-foreground">OTP-genomförandegrad</p>
                <p
                  className={`font-mono text-lg tabular-nums ${otpAlarm ? "text-destructive" : ""}`}
                >
                  {otpRate == null ? "—" : `${Math.round(otpRate * 100)} %`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {n(data?.otp?.completed_bookings)} bokningar av {n(data?.otp?.codes_sent)} koder
                  {otpAlarm ? " — under 85 %, larm" : ""}
                </p>
              </div>

              <div className="rounded-md border p-2">
                <p className="text-[11px] text-muted-foreground">SMS idag</p>
                <p className={`font-mono text-lg tabular-nums ${smsAlarm ? "text-destructive" : ""}`}>
                  {n(data?.sms?.total)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {n(data?.sms?.sent)} skickade · {n(data?.sms?.delivered)} levererade ·{" "}
                  <span className={smsErrors > 0 ? "text-destructive" : ""}>{n(smsErrors)} fel</span>
                  {Number(data?.sms?.test ?? 0) > 0 ? ` · ${n(data?.sms?.test)} testläge` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Kostnad {kr(data?.sms?.cost)} kr
                  {smsAlarm ? " — onormal volym, larm" : ""}
                </p>
              </div>

              <div className="rounded-md border p-2">
                <p className="text-[11px] text-muted-foreground">Misslyckade bokningar</p>
                <p className="font-mono text-lg tabular-nums">{n(failedBookings)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Avbrutna försök i bokningsflödet
                </p>
              </div>

              <div className="rounded-md border p-2">
                <p className="text-[11px] text-muted-foreground">Påminnelser som inte gick fram</p>
                <p
                  className={`font-mono text-lg tabular-nums ${
                    remindersFailed > 0 ? "text-destructive" : ""
                  }`}
                >
                  {n(remindersFailed)}
                </p>
                <p className="text-[11px] text-muted-foreground">Ring kunden om siffran inte är noll</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Honeypot och rate limit: {n(guardHits)} träffar
              </span>
              {guard.map((g) => (
                <Badge key={g.kind} variant="outline" className="font-mono text-[10px] tabular-nums">
                  {g.kind} {n(g.count)}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
