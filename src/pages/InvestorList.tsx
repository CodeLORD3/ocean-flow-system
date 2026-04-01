import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X, Users, Plus, Pencil, Trash2, ChevronDown, ChevronUp, FileText, Download, Eye, Shield, Mail, Phone, MapPin, Calendar, CreditCard, Globe } from "lucide-react";
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

function ExpandedInvestorDetail({
  inv,
  kycFiles,
  onUpdateVerification,
  onUpdateStatus,
  isUpdating,
}: {
  inv: any;
  kycFiles: { name: string; url: string }[];
  onUpdateVerification: (status: string) => void;
  onUpdateStatus: (status: string) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Personal Info */}
        <div className="space-y-3 border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" /> Personal Information
          </h3>
          <div className="space-y-2 text-[11px]">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 shrink-0">Full Name</span>
              <span className="font-medium">{inv.first_name} {inv.last_name}</span>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span>{inv.email}</span>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span>{inv.telephone || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span>{inv.address || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <Globe className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span>{inv.country || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span>{inv.date_of_birth || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span className="capitalize">{inv.account_type} account</span>
            </div>
          </div>
        </div>

        {/* Investment Profile */}
        <div className="space-y-3 border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-primary" /> Investment Profile
          </h3>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Classification</span>
              <span className="font-medium capitalize">{inv.investor_classification || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Currency</span>
              <span className="font-medium">{inv.base_currency || "SEK"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IBAN</span>
              <span className="font-mono text-[10px]">{inv.iban || "Not provided"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">KYC Completed</span>
              <span>{inv.kyc_completed ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Suitability Passed</span>
              <span>{inv.suitability_passed ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Applied</span>
              <span>{format(new Date(inv.created_at), "d MMM yyyy HH:mm")}</span>
            </div>
            {inv.reviewed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewed</span>
                <span>{format(new Date(inv.reviewed_at), "d MMM yyyy HH:mm")}</span>
              </div>
            )}
            {inv.reviewed_by && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewed By</span>
                <span>{inv.reviewed_by}</span>
              </div>
            )}
          </div>

          {/* Status actions */}
          <div className="pt-2 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Application Status</span>
              <StatusBadge status={inv.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Verification</span>
              <Select
                value={inv.verification_status || "action_required"}
                onValueChange={onUpdateVerification}
              >
                <SelectTrigger className="h-6 w-[130px] text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action_required">Action Required</SelectItem>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inv.status === "pending" && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-[10px] bg-green-600 hover:bg-green-700 text-white"
                  disabled={isUpdating}
                  onClick={() => onUpdateStatus("approved")}
                >
                  <Check className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-7 text-[10px]"
                  disabled={isUpdating}
                  onClick={() => onUpdateStatus("rejected")}
                >
                  <X className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* KYC Documents */}
        <div className="space-y-3 border border-border rounded-md p-3">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" /> KYC Documents
          </h3>
          {kycFiles.length === 0 ? (
            <div className="text-[11px] text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
              No documents uploaded yet.
              <br />
              <span className="text-[10px]">The investor has not submitted KYC files.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {kycFiles.map((file) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                return (
                  <div key={file.name} className="flex items-center gap-2 p-2 border border-border rounded-md bg-muted/30 hover:bg-muted/60 transition-colors">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{file.name.replace(/^\d+-/, "")}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-border hover:bg-accent transition-colors"
                        title="View"
                      >
                        <Eye className="h-3 w-3" />
                      </a>
                      <a
                        href={file.url}
                        download
                        className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-border hover:bg-accent transition-colors"
                        title="Download"
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px] px-1.5 py-0">Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px] px-1.5 py-0">Rejected</Badge>;
    default:
      return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-[9px] px-1.5 py-0">Pending</Badge>;
  }
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "verified":
      return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px] px-1.5 py-0">Verified</Badge>;
    case "pending":
      return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-[9px] px-1.5 py-0">Pending</Badge>;
    default:
      return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px] px-1.5 py-0">Action Req.</Badge>;
  }
}

export default function InvestorList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [kycFilesMap, setKycFilesMap] = useState<Record<string, { name: string; url: string }[]>>({});

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

  const loadKycFiles = async (userId: string) => {
    if (kycFilesMap[userId]) return; // already loaded
    try {
      const { data: files } = await supabase.storage.from("kyc-documents").list(userId);
      if (files && files.length > 0) {
        setKycFilesMap((prev) => ({
          ...prev,
          [userId]: files.map((f) => ({
            name: f.name,
            url: supabase.storage.from("kyc-documents").getPublicUrl(`${userId}/${f.name}`).data.publicUrl,
          })),
        }));
      } else {
        setKycFilesMap((prev) => ({ ...prev, [userId]: [] }));
      }
    } catch {
      setKycFilesMap((prev) => ({ ...prev, [userId]: [] }));
    }
  };

  const toggleExpand = (inv: any) => {
    if (expandedRow === inv.id) {
      setExpandedRow(null);
    } else {
      setExpandedRow(inv.id);
      loadKycFiles(inv.user_id);
    }
  };

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

  const updateVerification = useMutation({
    mutationFn: async ({ id, verification_status }: { id: string; verification_status: string }) => {
      const { error } = await supabase
        .from("investor_profiles" as any)
        .update({ verification_status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["investor-profiles"] });
      toast.success(`Verification status updated to ${vars.verification_status}`);
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

  const renderRow = (inv: any, idx: number) => {
    const isExpanded = expandedRow === inv.id;
    return (
      <>
        <TableRow
          key={inv.id}
          onClick={() => toggleExpand(inv)}
          className={`text-[11px] hover:bg-primary/10 transition-colors cursor-pointer ${idx % 2 === 1 ? "bg-muted/50" : ""}`}
        >
          <TableCell className="py-1.5 w-6 pl-3">
            {isExpanded
              ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
              : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </TableCell>
          <TableCell className="py-1.5 font-medium text-[11px]">{inv.first_name} {inv.last_name}</TableCell>
          <TableCell className="py-1.5 text-muted-foreground text-[11px]">{inv.email}</TableCell>
          <TableCell className="py-1.5 text-[11px]">{inv.telephone || "—"}</TableCell>
          <TableCell className="py-1.5">
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">{inv.account_type}</Badge>
          </TableCell>
          <TableCell className="py-1.5 text-[11px] capitalize">
            {inv.investor_classification || <span className="text-muted-foreground">—</span>}
          </TableCell>
          <TableCell className="py-1.5"><StatusBadge status={inv.status} /></TableCell>
          <TableCell className="py-1.5"><VerificationBadge status={inv.verification_status || "action_required"} /></TableCell>
          <TableCell className="py-1.5 text-[11px] text-muted-foreground">{format(new Date(inv.created_at), "yyyy-MM-dd")}</TableCell>
          <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(inv)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              onClick={() => { if (confirm("Delete this investor?")) deleteMutation.mutate(inv.id); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </TableCell>
        </TableRow>
        {isExpanded && (
          <TableRow key={`${inv.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
            <TableCell colSpan={10} className="p-0">
              <ExpandedInvestorDetail
                inv={inv}
                kycFiles={kycFilesMap[inv.user_id] || []}
                onUpdateVerification={(v) => updateVerification.mutate({ id: inv.id, verification_status: v })}
                onUpdateStatus={(s) => updateStatus.mutate({ id: inv.id, status: s })}
                isUpdating={updateStatus.isPending}
              />
            </TableCell>
          </TableRow>
        )}
      </>
    );
  };

  const tableHead = (
    <TableHeader>
      <TableRow className="text-[10px]">
        <TableHead className="py-1.5 w-6 text-[10px]"></TableHead>
        <TableHead className="py-1.5 text-[10px]">Name</TableHead>
        <TableHead className="py-1.5 text-[10px]">Email</TableHead>
        <TableHead className="py-1.5 text-[10px]">Phone</TableHead>
        <TableHead className="py-1.5 text-[10px]">Type</TableHead>
        <TableHead className="py-1.5 text-[10px]">Classification</TableHead>
        <TableHead className="py-1.5 text-[10px]">Status</TableHead>
        <TableHead className="py-1.5 text-[10px]">Verification</TableHead>
        <TableHead className="py-1.5 text-[10px]">Applied</TableHead>
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
              <TableBody>{pending.map((inv, idx) => renderRow(inv, idx))}</TableBody>
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
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-6 text-xs">
                    No reviewed investors yet
                  </TableCell>
                </TableRow>
              ) : (
                reviewed.map((inv, idx) => renderRow(inv, idx))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
