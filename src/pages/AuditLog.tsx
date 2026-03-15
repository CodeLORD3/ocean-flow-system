import { useState, useMemo } from "react";
import { ClipboardList, Search, Filter, Clock, User, Tag, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useStores } from "@/hooks/useStores";
import { useSite } from "@/contexts/SiteContext";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const actionColors: Record<string, string> = {
  create: "bg-green-500/15 text-green-400 border-green-500/30",
  update: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  delete: "bg-red-500/15 text-red-400 border-red-500/30",
  status_change: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approve: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  send: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const actionLabels: Record<string, string> = {
  create: "Skapad",
  update: "Uppdaterad",
  delete: "Borttagen",
  status_change: "Statusändring",
  approve: "Godkänd",
  send: "Skickad",
};

export default function AuditLog() {
  const { site, activeStoreId } = useSite();
  const isShop = site === "shop" && !!activeStoreId;

  const { data: logs = [], isLoading } = useActivityLogs({
    storeId: isShop ? activeStoreId! : undefined,
    limit: 500,
  });
  const { data: stores = [] } = useStores();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStore, setFilterStore] = useState<string>("all");

  const storeMap = useMemo(() => {
    const m: Record<string, string> = {};
    stores.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stores]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (filterType !== "all" && log.action_type !== filterType) return false;
      if (!isShop && filterStore !== "all" && log.store_id !== filterStore) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          log.description.toLowerCase().includes(q) ||
          (log.performed_by || "").toLowerCase().includes(q) ||
          (log.entity_type || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, search, filterType, filterStore, isShop]);

  const actionTypes = useMemo(() => {
    const set = new Set(logs.map((l) => l.action_type));
    return Array.from(set);
  }, [logs]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isShop ? "Aktivitetslogg" : "Revision & Logg"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isShop
              ? "Alla händelser för din butik"
              : "Spårning av alla ändringar och händelser i systemet"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök i loggen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla typer</SelectItem>
            {actionTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {actionLabels[t] || t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isShop && (
          <Select value={filterStore} onValueChange={setFilterStore}>
            <SelectTrigger className="w-[180px]">
              <Store className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Butik" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla butiker</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Händelselogg ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground py-8 text-center">Laddar logg...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Inga loggposter hittades</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Tidpunkt</TableHead>
                    <TableHead className="w-[100px]">Typ</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="w-[120px]">Entitet</TableHead>
                    {!isShop && <TableHead className="w-[130px]">Butik</TableHead>}
                    <TableHead className="w-[100px]">Portal</TableHead>
                    <TableHead className="w-[120px]">Utförd av</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: sv })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={actionColors[log.action_type] || ""}
                        >
                          {actionLabels[log.action_type] || log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{log.description}</TableCell>
                      <TableCell>
                        {log.entity_type && (
                          <Badge variant="secondary" className="text-xs">
                            {log.entity_type}
                          </Badge>
                        )}
                      </TableCell>
                      {!isShop && (
                        <TableCell className="text-sm">
                          {log.store_id ? storeMap[log.store_id] || "—" : "Grossist"}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {log.portal}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.performed_by || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
