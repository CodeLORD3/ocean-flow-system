import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle, Filter, DollarSign, Clock, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
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
        .select("*, trade_offers(title, maturity_date, interest_rate, company_iban, payment_reference_prefix), investor_profiles!inner(first_name, last_name, email)")
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      toast.success("Funds marked as received — investment is now Active");
    },
  });

  const markPaidOutMutation = useMutation({
    mutationFn: async (pledgeId: string) => {
      const { error } = await supabase
        .from("pledges")
        .update({ status: "Paid Out" })
        .eq("id", pledgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      toast.success("Investment marked as Paid Out");
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

  const statusFilters: { label: string; value: StatusFilter; count: number; color: string }[] = [
    { label: "All", value: "all", count: pledges.length, color: "" },
    { label: "Pending Payment", value: "Pending Payment", count: counts.pending, color: "text-amber-600" },
    { label: "Active", value: "Active", count: counts.active, color: "text-green-600" },
    { label: "Matured", value: "Matured", count: counts.matured, color: "text-orange-600" },
    { label: "Paid Out", value: "Paid Out", count: counts.paidOut, color: "text-primary" },
  ];

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "Pending Payment": return "bg-amber-100 text-amber-700 border-amber-300";
      case "Active": return "bg-green-50 text-green-700 border-green-200";
      case "Matured": return "bg-orange-50 text-orange-600 border-orange-200";
      case "Paid Out": return "bg-primary/10 text-primary border-primary/30";
      default: return "";
    }
  };

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
          <div className="text-[10px] text-muted-foreground mb-1">Active Investments</div>
          <div className="text-lg font-bold text-green-600">{counts.active}</div>
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
                <TableHead className="h-8 text-right">Amount</TableHead>
                <TableHead className="h-8">Reference</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8">Date Committed</TableHead>
                <TableHead className="h-8 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">No investments found.</TableCell>
                </TableRow>
              ) : (
                filtered.map((p: any, idx: number) => {
                  const investor = p.investor_profiles;
                  const offer = p.trade_offers;
                  const refCode = `${offer?.payment_reference_prefix || "OT-"}${new Date(p.created_at).getFullYear()}-${p.id.slice(0, 4).toUpperCase()}-${(p.offer_id || "").slice(0, 4).toUpperCase()}`;

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
                      <TableCell className="py-1.5 text-right font-mono">{Number(p.amount).toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 font-mono text-[10px]">{refCode}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[9px] ${statusBadgeClass(p.status)}`}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {format(parseISO(p.created_at), "yyyy-MM-dd HH:mm")}
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
                        {p.status === "Matured" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] text-primary border-primary/30 hover:bg-primary/5"
                            onClick={() => markPaidOutMutation.mutate(p.id)}
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
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
