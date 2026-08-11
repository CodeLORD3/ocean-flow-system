import { useMemo, useState } from "react";
import { Bug, Search, Clock, User, MonitorSmartphone, FileText, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useStores } from "@/hooks/useStores";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  BUG_STATUS_OPTIONS,
  BugReportStatus,
  bugStatusLabel,
  useBugReportStates,
  useSetBugReportStatus,
} from "@/hooks/useBugReportStates";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const portalLabels: Record<string, string> = {
  shop: "Butik",
  production: "Grossist",
  wholesale: "Admin",
};

const statusStyles: Record<BugReportStatus, string> = {
  new: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  planned: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  done: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  irrelevant: "bg-muted text-muted-foreground border-border",
  duplicate: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

type ViewTab = "open" | "done" | "irrelevant" | "planned" | "duplicate" | "all";

const viewTabs: { key: ViewTab; label: string }[] = [
  { key: "open", label: "Öppna" },
  { key: "planned", label: "Planerade" },
  { key: "done", label: "Avslutade" },
  { key: "irrelevant", label: "Orelevanta" },
  { key: "duplicate", label: "Dubbletter" },
  { key: "all", label: "Alla" },
];

/**
 * Adminvy över felrapporter som skickas via knappen "Rapportera fel".
 * Rapporterna sparas i activity_logs med action_type "bug_report" och får
 * en status i bug_report_states.
 */
export default function BugReports() {
  const { data: logs = [], isLoading } = useActivityLogs({ limit: 500 });
  const { data: stores = [] } = useStores();
  const { data: states = {} } = useBugReportStates();
  const setStatus = useSetBugReportStatus();
  const { staff } = useStaffAuth();
  const who = staff ? `${staff.first_name} ${staff.last_name}`.trim() : null;

  const [search, setSearch] = useState("");
  const [portal, setPortal] = useState<string>("all");
  const [tab, setTab] = useState<ViewTab>("open");

  const storeMap = useMemo(() => {
    const m: Record<string, string> = {};
    stores.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stores]);

  const allReports = useMemo(
    () => logs.filter((l) => l.action_type === "bug_report"),
    [logs],
  );

  const statusOf = (id: string): BugReportStatus => states[id]?.status ?? "new";

  const counts = useMemo(() => {
    const c: Record<ViewTab, number> = {
      open: 0, planned: 0, done: 0, irrelevant: 0, duplicate: 0, all: allReports.length,
    };
    allReports.forEach((r) => {
      const s = statusOf(r.id);
      if (s === "new") c.open += 1;
      else c[s] += 1;
    });
    return c;
  }, [allReports, states]);

  const reports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReports
      .filter((l) => {
        const s = statusOf(l.id);
        if (tab === "all") return true;
        if (tab === "open") return s === "new";
        return s === tab;
      })
      .filter((l) => (portal === "all" ? true : (l.portal || "") === portal))
      .filter((l) => {
        if (!q) return true;
        const d = (l.details || {}) as Record<string, any>;
        return [l.description, l.performed_by, d.page, d.text, d.user, d.user_email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [allReports, states, search, portal, tab]);

  const changeStatus = (logId: string, status: BugReportStatus) => {
    setStatus.mutate(
      { logId, status, updatedBy: who },
      {
        onSuccess: () => toast.success(`Flyttad till “${bugStatusLabel(status)}”`),
        onError: (e: any) => toast.error(e.message ?? "Kunde inte spara status"),
      },
    );
  };

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1">
          {viewTabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
              <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground">
                {counts[t.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
          title="Inga felrapporter här"
          description="När någon skickar en felrapport via knappen “Rapportera fel” hamnar den under Öppna."
        />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const d = (r.details || {}) as Record<string, any>;
            const text = d.text ? String(d.text) : r.description;
            const store = r.store_id ? storeMap[r.store_id] : d.store ? String(d.store) : null;
            const status = statusOf(r.id);
            const state = states[r.id];
            const isDone = status === "done";
            return (
              <Card key={r.id} className={`shadow-card ${isDone ? "opacity-70" : ""}`}>
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
                    <Badge variant="outline" className={`text-[10px] ${statusStyles[status]}`}>
                      {bugStatusLabel(status)}
                    </Badge>
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={isDone}
                      disabled={setStatus.isPending}
                      onCheckedChange={(v) => changeStatus(r.id, v ? "done" : "new")}
                      className="mt-0.5"
                      aria-label="Markera som åtgärdad"
                    />
                    <p
                      className={`text-xs whitespace-pre-wrap flex-1 ${
                        isDone ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {text}
                    </p>
                  </div>

                  {d.user_agent && (
                    <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                      <MonitorSmartphone className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="break-all">{String(d.user_agent)}</span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <Select
                      value={status}
                      onValueChange={(v) => changeStatus(r.id, v as BugReportStatus)}
                    >
                      <SelectTrigger className="h-7 w-40 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUG_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.key} value={o.key} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isDone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11px]"
                        disabled={setStatus.isPending}
                        onClick={() => changeStatus(r.id, "done")}
                      >
                        <Check className="h-3 w-3" /> Markera åtgärdad
                      </Button>
                    )}
                    {state?.updated_by && (
                      <span className="text-[10px] text-muted-foreground">
                        Senast ändrad av {state.updated_by}
                        {state.updated_at
                          ? ` · ${format(new Date(state.updated_at), "d MMM HH:mm", { locale: sv })}`
                          : ""}
                      </span>
                    )}
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
