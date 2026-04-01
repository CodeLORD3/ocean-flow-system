import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle, Filter, DollarSign } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";

type StatusFilter = "all" | "Pending Payment" | "Active" | "Matured" | "Paid Out";

export default function AdminPayments() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*, trade_offers(id, title, maturity_date, interest_rate, company_iban, payment_reference_prefix, target_amount, funded_amount, status), investor_profiles!inner(first_name, last_name, email, iban)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const markReceivedMutation = useMutation({
    mutationFn: async (pledgeId: string) => {
      const { error } = await supabase
        .from("pledges")
        .update({ status: "Active" })
        .eq("id", pledgeId);
      if (error) throw error;

      const pledge = pledges.find((p: any) => p.id === pledgeId);
      if (pledge) {
        // Update funded_amount on the offer
        const offer = pledge.trade_offers;
        if (offer) {
          const newFunded = Number(offer.funded_amount || 0) + Number(pledge.amount);
          await supabase
            .from("trade_offers")
            .update({
              funded_amount: newFunded,
              status: newFunded >= Number(offer.target_amount) ? "Funded" : offer.status,
            })
            .eq("id", pledge.offer_id);
        }

        // Log payment event
        await supabase.from("payment_events").insert({
          pledge_id: pledgeId,
          event_type: "funds_received",
          notes: "Marked as received by admin",
        });

        // Notify investor
        const offerTitle = offer?.title || "an offer";
        await supabase.from("notifications").insert({
          portal: "investor",
          target_page: "/portal/portfolio",
          message: `Your funds for "${offerTitle}" have been received. Your investment is now active.`,
          entity_type: "pledge",
          entity_id: pledgeId,
          user_id: pledge.user_id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["investment-log"] });
      toast.success("Funds marked as received — investment is now Active");
    },
  });

  const markPaidOutMutation = useMutation({
    mutationFn: async ({ pledgeId, offerId }: { pledgeId: string; offerId: string }) => {
      const { error } = await supabase
        .from("pledges")
        .update({ status: "Paid Out" })
        .eq("id", pledgeId);
      if (error) throw error;

      // Log payment event
      await supabase.from("payment_events").insert({
        pledge_id: pledgeId,
        event_type: "paid_out",
        notes: "Payout sent to investor",
      });

      // Notify investor with amount
      const pledge = pledges.find((p: any) => p.id === pledgeId);
      if (pledge) {
        const rate = pledge.trade_offers ? Number(pledge.trade_offers.interest_rate) : 0;
        const totalPayout = Math.round(Number(pledge.amount) * (1 + rate / 100));
        const offerTitle = pledge.trade_offers?.title || "an offer";
        await supabase.from("notifications").insert({
          portal: "investor",
          target_page: "/portal/portfolio",
          message: `Payout of ${totalPayout.toLocaleString()} kr for "${offerTitle}" has been sent to your registered IBAN.`,
          entity_type: "pledge",
          entity_id: pledgeId,
          user_id: pledge.user_id,
        });
      }

      // Check if all pledges for this offer are Paid Out → close offer
      const { data: remaining } = await supabase
        .from("pledges")
        .select("id")
        .eq("offer_id", offerId)
        .neq("status", "Paid Out");

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("trade_offers")
          .update({ status: "Closed" })
          .eq("id", offerId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["investment-log"] });
      queryClient.invalidateQueries({ queryKey: ["payout-offers"] });
      queryClient.invalidateQueries({ queryKey: ["payouts-paid-out"] });
      toast.success("Investment marked as Paid Out — investor notified");
    },
  });

  const filtered = statusFilter === "all"
    ? pledges
    : pledges.filter((p: any) => p.status === statusFilter);

  const counts = {
    pending: pledges.filter((p: any) => p.status === "Pending Payment").length,
    active: pledges.filter((p: any) => p.status === "Active").length,
    matured: pledges.filter((p: any) => p.status === "Matured").length,
    paidOut: pledges.filter((p: any) => p.status === "Paid Out").length,
  };

  const totalPending = pledges
    .filter((p: any) => p.status === "Pending Payment")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);

  const totalMaturedDue = pledges
    .filter((p: any) => p.status === "Matured")
    .reduce((s: number, p: any) => {
      const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
      return s + Number(p.amount) * (1 + rate / 100);
    }, 0);

  const statusFilters: { label: string; value: StatusFilter; count: number }[] = [
    { label: "All", value: "all", count: pledges.length },
    { label: "Pending Payment", value: "Pending Payment", count: counts.pending },
    { label: "Active", value: "Active", count: counts.active },
    { label: "Matured", value: "Matured", count: counts.matured },
    { label: "Paid Out", value: "Paid Out", count: counts.paidOut },
  ];

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

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Payment Tracking</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground mb-1">Pending Payments</div>
          <div className="text-lg font-bold text-amber-600">{counts.pending}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground mb-1">Pending Amount</div>
          <div className="text-lg font-bold text-amber-600">{totalPending.toLocaleString()} kr</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground mb-1">Matured — Due</div>
          <div className="text-lg font-bold text-orange-600">{Math.round(totalMaturedDue).toLocaleString()} kr</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-[10px] text-muted-foreground mb-1">Paid Out</div>
          <div className="text-lg font-bold text-primary">{counts.paidOut}</div>
        </CardContent></Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 text-[11px] border transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="h-8">Investor</TableHead>
                <TableHead className="h-8">Offer</TableHead>
                <TableHead className="h-8 text-right">Principal</TableHead>
                <TableHead className="h-8 text-right">Return</TableHead>
                <TableHead className="h-8 text-right">Total Payout</TableHead>
                <TableHead className="h-8">Reference</TableHead>
                <TableHead className="h-8">Investor IBAN</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8">Committed</TableHead>
                <TableHead className="h-8">Days Since Matured</TableHead>
                <TableHead className="h-8 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-xs text-muted-foreground">No investments found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((p: any, idx: number) => {
                  const investor = p.investor_profiles;
                  const offer = p.trade_offers;
                  const rate = offer ? Number(offer.interest_rate) : 0;
                  const principal = Number(p.amount);
                  const returnAmt = Math.round(principal * (rate / 100));
                  const totalPayout = principal + returnAmt;
                  const refCode = `${offer?.payment_reference_prefix || "OT-"}${new Date(p.created_at).getFullYear()}-${p.id.slice(0, 4).toUpperCase()}-${(p.offer_id || "").slice(0, 4).toUpperCase()}`;
                  const matDate = offer?.maturity_date ? new Date(offer.maturity_date) : null;
                  const daysSinceMatured = matDate && (p.status === "Matured" || p.status === "Paid Out")
                    ? differenceInDays(today, matDate)
                    : null;

                  return (
                    <TableRow
                      key={p.id}
                      className={`text-[11px] ${idx % 2 === 1 ? "bg-muted/30" : ""} hover:bg-muted/50 transition-colors`}
                    >
                      <TableCell className="py-1.5">
                        <div className="font-medium">{investor?.first_name} {investor?.last_name}</div>
                        <div className="text-[10px] text-muted-foreground">{investor?.email}</div>
                      </TableCell>
                      <TableCell className="py-1.5 font-medium">{offer?.title || "—"}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{principal.toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-green-600">{returnAmt.toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 text-right font-mono font-semibold">{totalPayout.toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px]">{refCode}</TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px]">{investor?.iban || "—"}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[9px] font-semibold tracking-wide rounded-none ${statusBadgeClass(p.status)}`}>
                          {(p.status || "").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {format(parseISO(p.created_at), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {daysSinceMatured !== null && daysSinceMatured >= 0 ? (
                          <span className={`font-bold ${daysSinceMatured > 7 ? "text-destructive" : daysSinceMatured > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {daysSinceMatured}d
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        {p.status === "Pending Payment" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => markReceivedMutation.mutate(p.id)}
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
                            onClick={() => markPaidOutMutation.mutate({ pledgeId: p.id, offerId: p.offer_id })}
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
