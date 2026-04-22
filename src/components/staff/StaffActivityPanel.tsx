import { useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Activity, Clock, MousePointerClick, LogIn, Loader2, Globe,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useStaffSessions,
  useStaffPageVisits,
  useStaffActivityActions,
} from "@/hooks/useStaffActivity";

interface Props {
  staffId: string;
  userId: string | null;
  staffName: string;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}t ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function isOnline(lastSeen: string, logoutAt: string | null): boolean {
  if (logoutAt) return false;
  const last = new Date(lastSeen).getTime();
  return Date.now() - last < 5 * 60_000; // 5 minutes
}

export function StaffActivityPanel({ staffId, userId, staffName }: Props) {
  const { data: sessions = [], isLoading: loadingSessions } = useStaffSessions(staffId, userId);
  const { data: visits = [], isLoading: loadingVisits } = useStaffPageVisits(staffId, userId);
  const { data: actions = [], isLoading: loadingActions } = useStaffActivityActions(staffName);

  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const totalSeconds = sessions.reduce((acc, s) => {
      if (s.duration_seconds) return acc + s.duration_seconds;
      // For open sessions, derive from login -> last_seen
      const start = new Date(s.login_at).getTime();
      const end = new Date(s.last_seen_at).getTime();
      return acc + Math.max(0, Math.round((end - start) / 1000));
    }, 0);
    const onlineNow = sessions.some((s) => isOnline(s.last_seen_at, s.logout_at));
    const lastLogin = sessions[0]?.login_at;
    return { totalSessions, totalSeconds, onlineNow, lastLogin };
  }, [sessions]);

  if (!userId) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Den här personen är inte kopplad till ett inloggningskonto än.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            För att se inloggningsaktivitet behöver staff-postens e-post matcha ett auth-konto, eller länkas manuellt nedan.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-2 w-2 rounded-full ${stats.onlineNow ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
              <p className="text-[10px] text-muted-foreground">Status</p>
            </div>
            <p className="text-sm font-heading font-bold text-foreground">
              {stats.onlineNow ? "Online nu" : "Offline"}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><LogIn className="h-3 w-3" /> Sessioner</p>
            <p className="text-xl font-heading font-bold text-foreground">{stats.totalSessions}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Total tid</p>
            <p className="text-xl font-heading font-bold text-foreground">{formatDuration(stats.totalSeconds)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Senast inloggad</p>
            <p className="text-xs font-medium text-foreground">
              {stats.lastLogin
                ? formatDistanceToNow(new Date(stats.lastLogin), { addSuffix: true, locale: sv })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sessions" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="sessions" className="text-xs">Sessioner</TabsTrigger>
          <TabsTrigger value="pages" className="text-xs">Sidvisningar</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">Aktiviteter</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-3">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loadingSessions ? (
                <div className="p-6 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Inga sessioner registrerade ännu.</div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Inloggad</th>
                        <th className="px-3 py-2 font-medium">Längd</th>
                        <th className="px-3 py-2 font-medium">Portal</th>
                        <th className="px-3 py-2 font-medium hidden md:table-cell">Webbläsare</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => {
                        const online = isOnline(s.last_seen_at, s.logout_at);
                        const dur = s.duration_seconds
                          ?? Math.max(0, Math.round((new Date(s.last_seen_at).getTime() - new Date(s.login_at).getTime()) / 1000));
                        return (
                          <tr key={s.id} className="border-t border-border/60">
                            <td className="px-3 py-2">
                              {format(new Date(s.login_at), "d MMM yyyy HH:mm", { locale: sv })}
                            </td>
                            <td className="px-3 py-2 font-medium">{formatDuration(dur)}</td>
                            <td className="px-3 py-2">
                              {s.portal && <Badge variant="outline" className="text-[10px]">{s.portal}</Badge>}
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                              {s.user_agent?.split(") ").pop() || "—"}
                            </td>
                            <td className="px-3 py-2">
                              {online ? (
                                <Badge className="bg-success/15 text-success border-success/30 text-[10px]">Online</Badge>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">Avslutad</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="mt-3">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loadingVisits ? (
                <div className="p-6 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : visits.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Inga sidvisningar registrerade.</div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Tid</th>
                        <th className="px-3 py-2 font-medium">Sida</th>
                        <th className="px-3 py-2 font-medium hidden sm:table-cell">Portal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map((v) => (
                        <tr key={v.id} className="border-t border-border/60">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {format(new Date(v.visited_at), "d MMM HH:mm", { locale: sv })}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 text-primary/60" />
                              <span className="font-medium text-foreground">{v.page_title || v.path}</span>
                              <span className="text-muted-foreground text-[10px]">{v.path}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            {v.portal && <Badge variant="outline" className="text-[10px]">{v.portal}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-3">
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loadingActions ? (
                <div className="p-6 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : actions.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Inga aktiviteter loggade på denna person ännu.
                </div>
              ) : (
                <ScrollArea className="h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Tid</th>
                        <th className="px-3 py-2 font-medium">Typ</th>
                        <th className="px-3 py-2 font-medium">Beskrivning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((a: any) => (
                        <tr key={a.id} className="border-t border-border/60">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {format(new Date(a.created_at), "d MMM HH:mm", { locale: sv })}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px] capitalize">{a.action_type}</Badge>
                          </td>
                          <td className="px-3 py-2 text-foreground">
                            <div className="flex items-start gap-1.5">
                              <MousePointerClick className="h-3 w-3 text-primary/60 mt-0.5 shrink-0" />
                              <span>{a.description}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
