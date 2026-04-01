import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { HandCoins, Search, Filter, CheckCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CountryFlag from "@/components/CountryFlag";
import { toast } from "sonner";

type StatusFilter = "all" | "Pending Payment" | "Active" | "Matured" | "Paid Out";

function getCurrency(country?: string | null) {
  if (!country) return "SEK";
  const c = country.toLowerCase();
  if (c === "switzerland" || c === "schweiz") return "CHF";
  return "SEK";
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "Pending Payment": return "bg-amber-100 text-amber-700 border-amber-300";
    case "Active": return "bg-green-50 text-green-700 border-green-200";
    case "Matured": return "bg-orange-50 text-orange-600 border-orange-200";
    case "Paid Out": return "bg-primary/10 text-primary border-primary/30";
    default: return "";
  }
};

export default function InvestmentLog() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");

  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ["investment-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("id, amount, status, created_at, user_id, offer_id, payment_reference")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const offerIds = [...new Set((data || []).map((p) => p.offer_id))];
      const { data: offers } = await supabase
        .from("trade_offers")
        .select("id, title, interest_rate, maturity_date, target_amount, funded_amount, status, company_id")
        .in("id", offerIds.length ? offerIds : ["none"]);

      const userIds = [...new Set((data || []).map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("investor_profiles")
        .select("user_id, first_name, last_name, email, account_type, iban")
        .in("user_id", userIds.length ? userIds : ["none"]);

      const companyIds = [...new Set((offers || []).map((o) => o.company_id).filter(Boolean))];
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, country, logo_url")
        .in("id", companyIds.length ? companyIds : ["none"]);

      const offerMap = Object.fromEntries((offers || []).map((o) => [o.id, o]));
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
      const companyMap = Object.fromEntries((companies || []).map((c) => [c.id, c]));

      return (data || []).map((p) => {
        const offer = offerMap[p.offer_id] || null;
        const company = offer?.company_id ? companyMap[offer.company_id] || null : null;
        return {
          ...p,
          offer,
          investor: profileMap[p.user_id] || null,
          company,
          currency: getCurrency(company?.country),
        };
      });
    },
  });

  // Mark Pending Payment → Active + update funded_amount
  const markReceivedMutation = useMutation({
    mutationFn: async (pledge: any) => {
      const { error } = await supabase
        .from("pledges")
        .update({ status: "Active" })
        .eq("id", pledge.id);
      if (error) throw error;

      // Update funded_amount on the offer
      if (pledge.offer) {
        const newFunded = Number(pledge.offer.funded_amount || 0) + Number(pledge.amount);
        await supabase
          .from("trade_offers")
          .update({ funded_amount: newFunded, status: newFunded >= Number(pledge.offer.target_amount) ? "Funded" : pledge.offer.status })
          .eq("id", pledge.offer_id);
      }

      // Log payment event
      await supabase.from("payment_events").insert({
        pledge_id: pledge.id,
        event_type: "funds_received",
        notes: `Marked as received by admin`,
      });

      // Notify investor
      const offerTitle = pledge.offer?.title || "an offer";
      await supabase.from("notifications").insert({
        portal: "investor",
        target_page: "/portal/portfolio",
        message: `Your funds for "${offerTitle}" have been received. Your investment is now active.`,
        entity_type: "pledge",
        entity_id: pledge.id,
        user_id: pledge.user_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment-log"] });
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      toast.success("Funds marked as received — investment is now Active");
    },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  // Mark Matured → Paid Out + close offer if all paid
  const markPaidOutMutation = useMutation({
    mutationFn: async (pledge: any) => {
      const { error } = await supabase
        .from("pledges")
        .update({ status: "Paid Out" })
        .eq("id", pledge.id);
      if (error) throw error;

      // Log payment event
      await supabase.from("payment_events").insert({
        pledge_id: pledge.id,
        event_type: "paid_out",
        notes: `Payout sent to investor`,
      });

      // Notify investor
      const rate = pledge.offer ? Number(pledge.offer.interest_rate) : 0;
      const totalPayout = Math.round(Number(pledge.amount) * (1 + rate / 100));
      const cur = pledge.currency || "SEK";
      const offerTitle = pledge.offer?.title || "an offer";
      await supabase.from("notifications").insert({
        portal: "investor",
        target_page: "/portal/portfolio",
        message: `Payout of ${totalPayout.toLocaleString()} ${cur} for "${offerTitle}" has been sent to your registered IBAN.`,
        entity_type: "pledge",
        entity_id: pledge.id,
        user_id: pledge.user_id,
      });

      // Check if all pledges for this offer are Paid Out → close offer
      const { data: remaining } = await supabase
        .from("pledges")
        .select("id")
        .eq("offer_id", pledge.offer_id)
        .neq("status", "Paid Out");

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("trade_offers")
          .update({ status: "Closed" })
          .eq("id", pledge.offer_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investment-log"] });
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      toast.success("Investment marked as Paid Out — investor notified");
    },
    onError: (e) => toast.error("Failed: " + e.message),
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

  const counts = {
    all: pledges.length,
    pending: pledges.filter((p: any) => p.status === "Pending Payment").length,
    active: pledges.filter((p: any) => p.status === "Active").length,
    matured: pledges.filter((p: any) => p.status === "Matured").length,
    paidOut: pledges.filter((p: any) => p.status === "Paid Out").length,
  };

  const totalFunded = useMemo(() => filtered.reduce((s: number, p: any) => s + (p.amount || 0), 0), [filtered]);

  const statusFilters: { label: string; value: StatusFilter; count: number }[] = [
    { label: "All", value: "all", count: counts.all },
    { label: "Pending Payment", value: "Pending Payment", count: counts.pending },
    { label: "Active", value: "Active", count: counts.active },
    { label: "Matured", value: "Matured", count: counts.matured },
    { label: "Paid Out", value: "Paid Out", count: counts.paidOut },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <HandCoins className="h-7 w-7 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investment Log</h1>
          <p className="text-sm text-muted-foreground">
            Track and manage all investor commitments
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
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
            <p className="text-xs text-muted-foreground">Pending Payment</p>
            <p className="text-2xl font-bold font-mono text-amber-600">{counts.pending}</p>
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search investor or offer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`px-3 py-1 text-[11px] rounded border transition-colors ${
                filterStatus === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
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
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Investor</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Expected Return</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="text-right w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any, idx: number) => {
                    const rate = p.offer?.interest_rate || 0;
                    const expectedReturn = p.amount * (1 + rate / 100);
                    const cur = p.currency || "SEK";
                    return (
                      <TableRow key={p.id} className={`hover:bg-primary/10 transition-colors ${idx % 2 === 1 ? "bg-muted/50" : ""}`}>
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
                          {(p.amount || 0).toLocaleString("sv-SE")} {cur}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {rate}%
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-500">
                          {Math.round(expectedReturn).toLocaleString("sv-SE")} {cur}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {p.payment_reference || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${statusBadgeClass(p.status)}`}
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {p.status === "Pending Payment" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => markReceivedMutation.mutate(p)}
                              disabled={markReceivedMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Mark Received
                            </Button>
                          )}
                          {p.status === "Matured" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] text-primary border-primary/30 hover:bg-primary/5"
                              onClick={() => markPaidOutMutation.mutate(p)}
                              disabled={markPaidOutMutation.isPending}
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              Mark Paid Out
                            </Button>
                          )}
                          {(p.status === "Active" || p.status === "Paid Out") && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
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
