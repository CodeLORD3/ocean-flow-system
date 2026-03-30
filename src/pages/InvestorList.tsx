import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, X, Users, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

export default function InvestorList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    telephone: "",
    address: "",
    date_of_birth: "",
    account_type: "private",
  });

  const { data: investors = [], isLoading } = useQuery({
    queryKey: ["investor-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investor_profiles" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("investor_profiles" as any)
        .update({ status, reviewed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["investor-profiles"] });
      toast.success(`Investor ${vars.status === "approved" ? "approved" : "rejected"}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createInvestor = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("investor_profiles" as any).insert({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        telephone: form.telephone,
        address: form.address,
        date_of_birth: form.date_of_birth,
        account_type: form.account_type,
        user_id: DEMO_USER_ID,
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: "Admin",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investor-profiles"] });
      toast.success("Investor created successfully");
      setShowCreate(false);
      setForm({ first_name: "", last_name: "", email: "", telephone: "", address: "", date_of_birth: "", account_type: "private" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px]">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[10px]">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-[10px]">Pending</Badge>;
    }
  };

  const pending = investors.filter((i: any) => i.status === "pending");
  const reviewed = investors.filter((i: any) => i.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold">Investor List</h1>
          <Badge variant="outline" className="ml-2">{investors.length} total</Badge>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Create Investor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Investor Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">First Name *</Label>
                  <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Last Name *</Label>
                  <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Telephone *</Label>
                <Input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Address *</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Date of Birth *</Label>
                  <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Account Type</Label>
                  <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full mt-2"
                disabled={!form.first_name || !form.last_name || !form.email || !form.telephone || !form.address || !form.date_of_birth || createInvestor.isPending}
                onClick={() => createInvestor.mutate()}
              >
                {createInvestor.isPending ? "Creating..." : "Create & Approve"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending applications */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-yellow-400">Pending Applications ({pending.length})</h2>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.first_name} {inv.last_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{inv.email}</TableCell>
                    <TableCell className="text-xs">{inv.telephone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{inv.account_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{inv.date_of_birth}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{inv.address}</TableCell>
                    <TableCell className="text-xs">{format(new Date(inv.created_at), "yyyy-MM-dd")}</TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-600/30 text-green-400 hover:bg-green-600/20"
                        onClick={() => updateStatus.mutate({ id: inv.id, status: "approved" })}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-red-600/30 text-red-400 hover:bg-red-600/20"
                        onClick={() => updateStatus.mutate({ id: inv.id, status: "rejected" })}
                      >
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* All investors */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">All Investors ({reviewed.length})</h2>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reviewed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No reviewed investors yet
                  </TableCell>
                </TableRow>
              ) : (
                reviewed.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.first_name} {inv.last_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{inv.email}</TableCell>
                    <TableCell className="text-xs">{inv.telephone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{inv.account_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{inv.date_of_birth}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{inv.address}</TableCell>
                    <TableCell className="text-xs">{format(new Date(inv.created_at), "yyyy-MM-dd")}</TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell className="text-xs">
                      {inv.reviewed_at ? format(new Date(inv.reviewed_at), "yyyy-MM-dd") : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
