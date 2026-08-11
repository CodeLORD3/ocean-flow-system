import { useMemo, useState } from "react";
import { Bug, Search, Clock, User, MonitorSmartphone, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useStores } from "@/hooks/useStores";
import { EmptyState } from "@/components/EmptyState";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const portalLabels: Record<string, string> = {
  shop: "Butik",
  production: "Grossist",
  wholesale: "Admin",
};

/**
 * Adminvy över felrapporter som skickas via knappen "Rapportera fel".
 * Rapporterna sparas i activity_logs med action_type "bug_report".
 */
export default function BugReports() {
  const { data: logs = [], isLoading } = useActivityLogs({ limit: 500 });
  const { data: stores = [] } = useStores();

  const [search, setSearch] = useState("");
  const [portal, setPortal] = useState<string>("all");

  const storeMap = useMemo(() => {
    const m: Record<string, string> = {};
    stores.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stores]);

  const reports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs
      .filter((l) => l.action_type === "bug_report")
      .filter((l) => (portal === "all" ? true : (l.portal || "") === portal))
      .filter((l) => {
        if (!q) return true;
        const d = (l.details || {}) as Record<string, any>;
        return [l.description, l.performed_by, d.page, d.text, d.user, d.user_email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [logs, search, portal]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Bug className="h-5 w-5 text-primary" /> Felrapporter
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rapporter som personalen skickar via knappen “Rapportera fel”
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök på text, sida eller person..."
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select value={portal} onValueChange={setPortal}>
          <SelectTrigger className="h-9 w-full sm:w-44 text-xs">
            <SelectValue placeholder="Alla portaler" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alla portaler</SelectItem>
            <SelectItem value="shop" className="text-xs">Butik</SelectItem>
            <SelectItem value="production" className="text-xs">Grossist</SelectItem>
            <SelectItem value="wholesale" className="text-xs">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="h-9 px-3 text-xs flex items-center tabular-nums">
          {reports.length} rapporter
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Bug className="h-4 w-4" />}
          title="Inga felrapporter"
          description="När någon skickar en felrapport via knappen “Rapportera fel” hamnar den här."
        />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const d = (r.details || {}) as Record<string, any>;
            const text = d.text ? String(d.text) : r.description;
            const store = r.store_id ? storeMap[r.store_id] : d.store ? String(d.store) : null;
            return (
              <Card key={r.id} className="shadow-card">
                <CardContent className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span className="tabular-nums">
                        {format(new Date(r.created_at), "d MMM yyyy HH:mm", { locale: sv })}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {r.performed_by || d.user || "Okänd"}
                      {d.user_email ? ` · ${d.user_email}` : ""}
                    </span>
                    {d.page && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <code className="text-[10px]">{String(d.page)}</code>
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {portalLabels[r.portal] ?? r.portal}
                      {store ? ` · ${store}` : ""}
                    </Badge>
                  </div>

                  <p className="text-xs text-foreground whitespace-pre-wrap">{text}</p>

                  {d.user_agent && (
                    <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                      <MonitorSmartphone className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="break-all">{String(d.user_agent)}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
