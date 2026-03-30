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
import { Check, X, Users, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  telephone: "",
  address: "",
  date_of_birth: "",
  account_type: "private",
};

export default function InvestorList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: investors = [] } = useQuery({
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase
          .from("investor_profiles" as any)
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            telephone: form.telephone,
            address: form.address,
            date_of_birth: form.date_of_birth,
            account_type: form.account_type,
          } as any)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("investor_profiles" as any).insert({
          ...form,
          user_id: DEMO_USER_ID,
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: "Admin",
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investor-profiles"] });
      toast.success(editingId ? "Investor updated" : "Investor created");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("investor_profiles" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investor-profiles"] });
      toast.success("Investor deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const closeDialog = () => {
    setShowCreate(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const openEdit = (inv: any) => {
    setEditingId(inv.id);
    setForm({
      first_name: inv.first_name || "",
      last_name: inv.last_name || "",
      email: inv.email || "",
      telephone: inv.telephone || "",
      address: inv.address || "",
      date_of_birth: inv.date_of_birth || "",
      account_type: inv.account_type || "private",
    });
    setShowCreate(true);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px] px-1.5 py-0">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px] px-1.5 py-0">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-[9px] px-1.5 py-0">Pending</Badge>;
    }
  };

  const pending = investors.filter((i: any) => i.status === "pending");
  const reviewed = investors.filter((i: any) => i.status !== "pending");

  const formValid = form.first_name && form.last_name && form.email && form.telephone && form.address && form.date_of_birth;

  const InvestorFormDialog = (
    <Dialog open={showCreate} onOpenChange={(open) => { if (!open) closeDialog(); else setShowCreate(true); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Investor" : "Create Investor Profile"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">First Name *</Label>
              <Input className="h-8 text-xs" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Last Name *</Label>
              <Input className="h-8 text-xs" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email *</Label>
            <Input className="h-8 text-xs" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Telephone *</Label>
            <Input className="h-8 text-xs" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Address *</Label>
            <Input className="h-8 text-xs" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date of Birth *</Label>
              <Input className="h-8 text-xs" type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Account Type</Label>
              <Select value={form.account_type} onValueChange={v => setForm(f => ({ ...f, account_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full mt-2"
            size="sm"
            disabled={!formValid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create & Approve"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderRow = (inv: any, showActions: boolean, idx?: number) => (
    <TableRow key={inv.id} className={`text-[11px] hover:bg-primary/10 transition-colors ${idx !== undefined && idx % 2 === 1 ? "bg-muted/30" : ""}`}>
      <TableCell className="py-1.5 font-medium text-[11px]">{inv.first_name} {inv.last_name}</TableCell>
      <TableCell className="py-1.5 text-muted-foreground text-[11px]">{inv.email}</TableCell>
      <TableCell className="py-1.5 text-[11px]">{inv.telephone}</TableCell>
      <TableCell className="py-1.5">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">{inv.account_type}</Badge>
      </TableCell>
      <TableCell className="py-1.5 text-[11px]">{inv.date_of_birth}</TableCell>
      <TableCell className="py-1.5 text-[11px] max-w-[120px] truncate">{inv.address}</TableCell>
      <TableCell className="py-1.5 text-[11px]">{format(new Date(inv.created_at), "yyyy-MM-dd")}</TableCell>
      <TableCell className="py-1.5">{statusBadge(inv.status)}</TableCell>
      <TableCell className="py-1.5 text-right space-x-0.5">
        {showActions && inv.status === "pending" && (
          <>
            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] border-green-600/30 text-green-400 hover:bg-green-600/20"
              onClick={() => updateStatus.mutate({ id: inv.id, status: "approved" })}>
              <Check className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px] border-red-600/30 text-red-400 hover:bg-red-600/20"
              onClick={() => updateStatus.mutate({ id: inv.id, status: "rejected" })}>
              <X className="h-3 w-3" />
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(inv)}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          onClick={() => { if (confirm("Delete this investor?")) deleteMutation.mutate(inv.id); }}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );

  const tableHead = (
    <TableHeader>
      <TableRow className="text-[10px]">
        <TableHead className="py-1.5 text-[10px]">Name</TableHead>
        <TableHead className="py-1.5 text-[10px]">Email</TableHead>
        <TableHead className="py-1.5 text-[10px]">Phone</TableHead>
        <TableHead className="py-1.5 text-[10px]">Type</TableHead>
        <TableHead className="py-1.5 text-[10px]">DOB</TableHead>
        <TableHead className="py-1.5 text-[10px]">Address</TableHead>
        <TableHead className="py-1.5 text-[10px]">Applied</TableHead>
        <TableHead className="py-1.5 text-[10px]">Status</TableHead>
        <TableHead className="py-1.5 text-[10px] text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-5">
      {InvestorFormDialog}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" />
          <h1 className="text-lg font-bold">Investor List</h1>
          <Badge variant="outline" className="text-[10px]">{investors.length} total</Badge>
        </div>
        <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setShowCreate(true); }}>
          <Plus className="h-3.5 w-3.5" /> Create Investor
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold text-yellow-400">Pending Applications ({pending.length})</h2>
          <div className="border rounded-md overflow-hidden">
            <Table>
              {tableHead}
              <TableBody>{pending.map((inv, idx) => renderRow(inv, true, idx))}</TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <h2 className="text-xs font-semibold">All Investors ({reviewed.length})</h2>
        <div className="border rounded-md overflow-hidden">
          <Table>
            {tableHead}
            <TableBody>
              {reviewed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-xs">
                    No reviewed investors yet
                  </TableCell>
                </TableRow>
              ) : (
                reviewed.map(inv => renderRow(inv, false))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
