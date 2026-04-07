import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Building2, ArrowLeft, Upload, Pencil, Eye } from "lucide-react";
import CountryFlag from "@/components/CountryFlag";
import { toast } from "sonner";

const COUNTRY_OPTIONS = [
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "IS", name: "Iceland", flag: "🇮🇸" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "IN", name: "India", flag: "🇮🇳" },
];

export function getCountryFlag(country: string | null | undefined): string {
  if (!country) return "";
  const c = COUNTRY_OPTIONS.find(
    (o) => o.name.toLowerCase() === country.toLowerCase() || o.code.toLowerCase() === country.toLowerCase()
  );
  return c?.flag || "";
}

const EMPTY_FORM = {
  name: "",
  country: "Sweden",
  industry: "",
  description: "",
  description_long: "",
  contact_person: "",
  contact_email: "",
  iban: "",
  address: "",
  city: "",
  ticker: "",
  status: "Active",
  founded_year: "",
  employee_count: "",
  revenue_range: "",
  website_url: "",
};

export default function Companies() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "create" | "edit" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Count offers per company
  const { data: offerCounts = {} } = useQuery({
    queryKey: ["company-offer-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("company_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((o: any) => {
        if (o.company_id) counts[o.company_id] = (counts[o.company_id] || 0) + 1;
      });
      return counts;
    },
  });

  const uploadLogo = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `company-logos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("trade-offers").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("trade-offers").getPublicUrl(path);
    return data.publicUrl;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logo_url: string | null = null;
      if (logoFile) logo_url = await uploadLogo(logoFile);

      const payload: any = {
        name: form.name,
        country: form.country,
        industry: form.industry || null,
        description: form.description || null,
        description_long: form.description_long || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        iban: form.iban || null,
        address: form.address || null,
        city: form.city || null,
        ticker: form.ticker || null,
        status: form.status,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        employee_count: form.employee_count || null,
        revenue_range: form.revenue_range || null,
        website_url: form.website_url || null,
      };
      if (logo_url) payload.logo_url = logo_url;

      if (selectedId) {
        const { error } = await supabase.from("companies").update(payload).eq("id", selectedId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("companies").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(selectedId ? "Company updated" : "Company created");
      setView("list");
      setForm({ ...EMPTY_FORM });
      setLogoFile(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = (company: any) => {
    setSelectedId(company.id);
    setForm({
      name: company.name,
      country: company.country || "Sweden",
      industry: company.industry || "",
      description: company.description || "",
      description_long: company.description_long || "",
      contact_person: company.contact_person || "",
      contact_email: company.contact_email || "",
      iban: company.iban || "",
      address: company.address || "",
      city: company.city || "",
      ticker: company.ticker || "",
      status: company.status || "Active",
      founded_year: company.founded_year ? String(company.founded_year) : "",
      employee_count: company.employee_count || "",
      revenue_range: company.revenue_range || "",
      website_url: company.website_url || "",
    });
    setLogoFile(null);
    setView("edit");
  };

  const openDetail = (company: any) => {
    setSelectedId(company.id);
    setView("detail");
  };

  // Detail view
  if (view === "detail" && selectedId) {
    const company = companies.find((c: any) => c.id === selectedId) as any;
    if (!company) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setView("list")}>
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
          <h1 className="text-lg font-bold">{company.name}</h1>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 ml-auto" onClick={() => openEdit(company)}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-4">
              {company.logo_url && (
                <img src={company.logo_url} alt={company.name} className="h-14 w-14 object-contain border border-border rounded" />
              )}
              <div>
                <div className="text-sm font-bold">{company.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><CountryFlag country={company.country} size={14} /> {company.country} · {company.industry || "—"}</div>
              </div>
              <Badge variant={company.status === "Active" ? "default" : "secondary"} className="ml-auto text-[10px]">
                {company.status}
              </Badge>
            </div>
            {company.description && <p className="text-xs text-muted-foreground">{company.description}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Contact:</span> {company.contact_person || "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {company.contact_email || "—"}</div>
              <div><span className="text-muted-foreground">IBAN:</span> {company.iban || "—"}</div>
              <div><span className="text-muted-foreground">Ticker:</span> {company.ticker || "—"}</div>
              <div><span className="text-muted-foreground">Address:</span> {company.address || "—"}</div>
              <div><span className="text-muted-foreground">City:</span> {company.city || "—"}</div>
              <div><span className="text-muted-foreground">Offers:</span> {(offerCounts as any)[company.id] || 0}</div>
              <div><span className="text-muted-foreground">Added:</span> {new Date(company.created_at).toLocaleDateString()}</div>
              <div><span className="text-muted-foreground">Founded:</span> {company.founded_year || "—"}</div>
              <div><span className="text-muted-foreground">Employees:</span> {company.employee_count || "—"}</div>
              <div><span className="text-muted-foreground">Revenue:</span> {company.revenue_range || "—"}</div>
              <div><span className="text-muted-foreground">Website:</span> {company.website_url ? <a href={company.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{company.website_url}</a> : "—"}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Create / Edit form
  if (view === "create" || view === "edit") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => { setView("list"); setSelectedId(null); setForm({ ...EMPTY_FORM }); }}>
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
          <h1 className="text-lg font-bold">{view === "edit" ? "Edit Company" : "Add Company"}</h1>
        </div>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Company Name *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Country *</label>
                <Select value={form.country} onValueChange={v => setForm({ ...form, country: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map(c => (
                      <SelectItem key={c.code} value={c.name} className="text-xs">
                        {c.flag} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Industry / Sector</label>
                <Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="h-8 text-xs" placeholder="e.g. Seafood Trading" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Contact Person</label>
                <Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Contact Email</label>
                <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">IBAN</label>
                <Input value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value.toUpperCase() })} className="h-8 text-xs" placeholder="SE00 0000 0000 0000 0000 0000" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Address</label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="h-8 text-xs" placeholder="Full street address" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">City</label>
                <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="h-8 text-xs" placeholder="e.g. Gothenburg" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Ticker (map label)</label>
                <Input value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} className="h-8 text-xs" placeholder="e.g. FSS" maxLength={8} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Company Logo</label>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => logoRef.current?.click()}>
                  <Upload className="h-3 w-3" /> {logoFile ? logoFile.name.slice(0, 25) : "Choose image"}
                </Button>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-muted-foreground">Short Description (tagline)</label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="text-xs min-h-[60px]" placeholder="Short company description..." />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-muted-foreground">Full Description (investor profile page)</label>
                <Textarea value={form.description_long} onChange={e => setForm({ ...form, description_long: e.target.value })} className="text-xs min-h-[100px]" placeholder="Detailed company description for the investor-facing profile page..." />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Founded Year</label>
                <Input type="number" value={form.founded_year} onChange={e => setForm({ ...form, founded_year: e.target.value })} className="h-8 text-xs" placeholder="e.g. 2018" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Employee Count</label>
                <Input value={form.employee_count} onChange={e => setForm({ ...form, employee_count: e.target.value })} className="h-8 text-xs" placeholder="e.g. 10–50" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Revenue Range</label>
                <Input value={form.revenue_range} onChange={e => setForm({ ...form, revenue_range: e.target.value })} className="h-8 text-xs" placeholder="e.g. 10–50M SEK" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Website URL</label>
                <Input value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} className="h-8 text-xs" placeholder="https://..." />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[10px] text-muted-foreground">Status</label>
                <Switch
                  checked={form.status === "Active"}
                  onCheckedChange={v => setForm({ ...form, status: v ? "Active" : "Inactive" })}
                />
                <span className="text-xs">{form.status}</span>
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.country || saveMutation.isPending} className="w-full h-8 text-xs">
              {saveMutation.isPending ? "Saving..." : view === "edit" ? "Update Company" : "Add Company"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Companies</h1>
        </div>
        <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => { setForm({ ...EMPTY_FORM }); setSelectedId(null); setView("create"); }}>
          <Plus className="h-3 w-3" /> Add Company
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="h-8">Company</TableHead>
                <TableHead className="h-8">Country</TableHead>
                <TableHead className="h-8">Industry</TableHead>
                <TableHead className="h-8 text-center">Status</TableHead>
                <TableHead className="h-8 text-right">Offers</TableHead>
                <TableHead className="h-8">Added</TableHead>
                <TableHead className="h-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c: any) => (
                <TableRow key={c.id} className="text-[10px]">
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-2">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="h-6 w-6 object-contain rounded" />
                      ) : (
                        <div className="h-6 w-6 bg-muted flex items-center justify-center rounded text-[8px] font-bold text-muted-foreground">
                          {c.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5"><span className="flex items-center gap-1"><CountryFlag country={c.country} size={14} /> {c.country}</span></TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{c.industry || "—"}</TableCell>
                  <TableCell className="py-1.5 text-center">
                    <Badge variant={c.status === "Active" ? "default" : "secondary"} className="text-[9px]">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono">{(offerCounts as any)[c.id] || 0}</TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openDetail(c)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(c)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No companies yet. Add your first partner company.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
