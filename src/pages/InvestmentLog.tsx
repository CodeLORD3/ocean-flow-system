import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { HandCoins, Search, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CountryFlag from "@/components/CountryFlag";

interface PledgeRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  user_id: string;
  offer: {
    id: string;
    title: string;
    interest_rate: number;
    maturity_date: string;
    target_amount: number;
    funded_amount: number;
    status: string;
    company_id: string | null;
  } | null;
  investor: {
    first_name: string;
    last_name: string;
    email: string;
    account_type: string;
  } | null;
}

const statusColors: Record<string, string> = {
  Active: "bg-green-500/15 text-green-400 border-green-500/30",
  Repaid: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function InvestmentLog() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ["investment-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("id, amount, status, created_at, user_id, offer_id")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch related offers
      const offerIds = [...new Set((data || []).map((p) => p.offer_id))];
      const { data: offers } = await supabase
        .from("trade_offers")
        .select("id, title, interest_rate, maturity_date, target_amount, funded_amount, status, company_id")
        .in("id", offerIds.length ? offerIds : ["none"]);

      // Fetch investor profiles
      const userIds = [...new Set((data || []).map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("investor_profiles")
        .select("user_id, first_name, last_name, email, account_type")
        .in("user_id", userIds.length ? userIds : ["none"]);

      // Fetch companies for flags
      const companyIds = [...new Set((offers || []).map((o) => o.company_id).filter(Boolean))];
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, country, logo_url")
        .in("id", companyIds.length ? companyIds : ["none"]);

      const offerMap = Object.fromEntries((offers || []).map((o) => [o.id, o]));
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      const companyMap = Object.fromEntries((companies || []).map((c) => [c.id, c]));

      return (data || []).map((p) => ({
        ...p,
        offer: offerMap[p.offer_id] || null,
        investor: profileMap[p.user_id] || null,
        company: p.offer_id && offerMap[p.offer_id]?.company_id
          ? companyMap[offerMap[p.offer_id].company_id!] || null
          : null,
      }));
    },
  });

  const filtered = useMemo(() => {
    return pledges.filter((p: any) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const investorName = p.investor
          ? `${p.investor.first_name} ${p.investor.last_name}`.toLowerCase()
          : "";
        const offerTitle = p.offer?.title?.toLowerCase() || "";
        return investorName.includes(q) || offerTitle.includes(q) || p.investor?.email?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [pledges, search, filterStatus]);

  const totalFunded = useMemo(() => filtered.reduce((s: number, p: any) => s + (p.amount || 0), 0), [filtered]);
  const statuses = useMemo(() => [...new Set(pledges.map((p: any) => p.status))], [pledges]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <HandCoins className="h-7 w-7 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investment Log</h1>
          <p className="text-sm text-muted-foreground">
            All funded investments across trade offers
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Investments</p>
            <p className="text-2xl font-bold font-mono">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Funded</p>
            <p className="text-2xl font-bold font-mono text-emerald-500">
              {totalFunded.toLocaleString("sv-SE")} kr
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Unique Investors</p>
            <p className="text-2xl font-bold font-mono">
              {new Set(filtered.map((p: any) => p.user_id)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search investor or offer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s: string) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <HandCoins className="h-5 w-5" />
            Investments ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground py-8 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No investments found</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead>Investor</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Expected Return</TableHead>
                    <TableHead className="w-[90px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const rate = p.offer?.interest_rate || 0;
                    const expectedReturn = p.amount * (1 + rate / 100);
                    return (
                      <TableRow key={p.id} className={`hover:bg-primary/10 transition-colors ${filtered.indexOf(p) % 2 === 1 ? "bg-muted/50" : ""}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(p.created_at), "d MMM yyyy HH:mm", { locale: sv })}
                        </TableCell>
                        <TableCell>
                          {p.investor ? (
                            <div>
                              <span className="font-medium text-sm">
                                {p.investor.first_name} {p.investor.last_name}
                              </span>
                              <p className="text-[10px] text-muted-foreground">{p.investor.email}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {p.offer?.title || "—"}
                        </TableCell>
                        <TableCell>
                          {p.company ? (
                            <div className="flex items-center gap-1.5">
                              <CountryFlag country={p.company.country} size={14} />
                              <span className="text-xs">{p.company.name}</span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {(p.amount || 0).toLocaleString("sv-SE")} kr
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {rate}%
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-500">
                          {Math.round(expectedReturn).toLocaleString("sv-SE")} kr
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColors[p.status] || ""}
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
