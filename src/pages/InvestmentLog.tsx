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
    case "Pending Payment": return "text-amber-700 bg-amber-50 border-amber-200";
    case "Active": return "text-mackerel bg-mackerel-light border-mackerel/30";
    case "Matured": return "text-orange-600 bg-orange-50 border-orange-200";
    case "Paid Out":
    case "Repaid": return "text-primary bg-primary/5 border-primary/20";
    default: return "text-muted-foreground bg-muted/50 border-border";
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
      queryClient.invalidateQueries({ queryKey: ["payouts-paid-out"] });
      queryClient.invalidateQueries({ queryKey: ["payout-offers"] });
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

  const totalFunded = useMemo(() => filtered.filter((p: any) => ["Active", "Matured", "Paid Out"].includes(p.status)).reduce((s: number, p: any) => s + (p.amount || 0), 0), [filtered]);
  const totalPendingCommitted = useMemo(() => filtered.filter((p: any) => p.status === "Pending Payment").reduce((s: number, p: any) => s + (p.amount || 0), 0), [filtered]);

  const statusFilters: { label: string; value: StatusFilter; count: number }[] = [
    { label: "All", value: "all", count: counts.all },
    { label: "Pending Payment", value: "Pending Payment", count: counts.pending },
    { label: "Active", value: "Active", count: counts.active },
    { label: "Matured", value: "Matured", count: counts.matured },
    { label: "Paid Out", value: "Paid Out", count: counts.paidOut },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-5 w-5 text-emerald-400" />
        <h1 className="text-lg font-bold text-foreground">Investment Log</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Total Investments</div>
            <div className="text-lg font-bold font-mono">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Confirmed Funded</div>
            <div className="text-lg font-bold font-mono text-mackerel">
              {totalFunded.toLocaleString("sv-SE")} kr
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Pending Committed</div>
            <div className="text-lg font-bold font-mono text-amber-600">
              {totalPendingCommitted.toLocaleString("sv-SE")} kr
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Pending Count</div>
            <div className="text-lg font-bold font-mono text-amber-600">{counts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Unique Investors</div>
            <div className="text-lg font-bold font-mono">
              {new Set(filtered.map((p: any) => p.user_id)).size}
            </div>
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
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="h-8">Date</TableHead>
                <TableHead className="h-8">Investor</TableHead>
                <TableHead className="h-8">Offer</TableHead>
                <TableHead className="h-8">Company</TableHead>
                <TableHead className="h-8 text-right">Amount</TableHead>
                <TableHead className="h-8 text-right">Rate</TableHead>
                <TableHead className="h-8 text-right">Expected Return</TableHead>
                <TableHead className="h-8">Reference</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-xs text-muted-foreground">No investments found</TableCell>
                </TableRow>
              ) : (
                filtered.map((p: any, idx: number) => {
                  const rate = p.offer?.interest_rate || 0;
                  const expectedReturn = p.amount * (1 + rate / 100);
                  const cur = p.currency || "SEK";
                  return (
                    <TableRow key={p.id} className={`text-[11px] hover:bg-muted/50 transition-colors ${idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                      <TableCell className="py-1.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(p.created_at), "d MMM yyyy HH:mm", { locale: sv })}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {p.investor ? (
                          <div>
                            <span className="font-medium">
                              {p.investor.first_name} {p.investor.last_name}
                            </span>
                            <p className="text-[10px] text-muted-foreground">{p.investor.email}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-medium max-w-[200px] truncate">
                        {p.offer?.title || "—"}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {p.company ? (
                          <div className="flex items-center gap-1.5">
                            <CountryFlag country={p.company.country} size={14} />
                            <span className="text-[10px]">{p.company.name}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono font-medium">
                        {(p.amount || 0).toLocaleString("sv-SE")} {cur}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono">
                        {rate}%
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-emerald-500">
                        {Math.round(expectedReturn).toLocaleString("sv-SE")} {cur}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px] text-muted-foreground">
                        {p.payment_reference || "—"}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-semibold tracking-wide rounded-none ${statusBadgeClass(p.status)}`}
                        >
                          {(p.status || "").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
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
                        {(p.status === "Active" || p.status === "Matured") && (
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
                        {p.status === "Paid Out" && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
