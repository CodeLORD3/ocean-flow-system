import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Recycle, Upload, FileText, Trash2, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Props {
  storeId?: string | null;
}

const empty = {
  collected_date: new Date().toISOString().slice(0, 10),
  category: "3",
  quantity_kg: "",
  receiver_name: "",
  receiver_approval_number: "",
  transporter_name: "",
  transporter_approval_number: "",
  document_number: "",
  note: "",
};

/**
 * Handelsdokument för animaliska biprodukter. Varje hämtning av kategori 2
 * eller 3 ska ha ett handelsdokument som visar mängd, mottagande anläggning
 * och transportör. Saknas dokument för de senaste 30 dagarna visas en varning.
 */
export default function AbpPanel({ storeId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...empty });
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["abp_consignments", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("abp_consignments")
        .select("*")
        .order("collected_date", { ascending: false })
        .limit(100);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const missing = useMemo(() => {
    if (!rows.length) return true;
    const limit = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return !rows.some((r) => r.collected_date >= limit);
  }, [rows]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.receiver_name.trim()) throw new Error("Mottagande anläggning måste anges.");
      const file = fileRef.current?.files?.[0];
      const { data: inserted, error } = await supabase
        .from("abp_consignments")
        .insert({
          store_id: storeId ?? null,
          collected_date: form.collected_date,
          category: Number(form.category),
          quantity_kg: form.quantity_kg ? Number(form.quantity_kg.replace(",", ".")) : null,
          receiver_name: form.receiver_name.trim(),
          receiver_approval_number: form.receiver_approval_number || null,
          transporter_name: form.transporter_name || null,
          transporter_approval_number: form.transporter_approval_number || null,
          document_number: form.document_number || null,
          note: form.note || null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      if (file) {
        const path = `abp/${inserted.id}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("lot-documents")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        await supabase
          .from("abp_consignments")
          .update({ file_path: path, file_name: file.name } as any)
          .eq("id", inserted.id);
      }
    },
    onSuccess: () => {
      toast.success("Hämtningen är registrerad.");
      setForm({ ...empty });
      if (fileRef.current) fileRef.current.value = "";
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["abp_consignments"] });
    },
    onError: (e: any) => toast.error(e.message || "Hämtningen kunde inte sparas."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("abp_consignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hämtningen är borttagen.");
      qc.invalidateQueries({ queryKey: ["abp_consignments"] });
    },
    onError: (e: any) => toast.error(e.message || "Kunde inte tas bort."),
  });

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("lot-documents")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error("Filen kunde inte öppnas.");
    window.open(data.signedUrl, "_blank");
  };

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Recycle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Animaliska biprodukter</span>
          {missing && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              Handelsdokument saknas senaste 30 dagarna
            </Badge>
          )}
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5" />
          Ny hämtning
        </Button>
      </div>

      {open && (
        <Card className="space-y-2 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Datum</Label>
              <Input
                type="date"
                value={form.collected_date}
                onChange={(e) => set("collected_date", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Kategori</Label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="3">Kategori 3</option>
                <option value="2">Kategori 2</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Mängd, kg</Label>
              <Input
                value={form.quantity_kg}
                onChange={(e) => set("quantity_kg", e.target.value)}
                className="h-9 font-mono text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Mottagande anläggning</Label>
              <Input
                value={form.receiver_name}
                onChange={(e) => set("receiver_name", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Godkännandenummer, mottagare</Label>
              <Input
                value={form.receiver_approval_number}
                onChange={(e) => set("receiver_approval_number", e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Transportör</Label>
              <Input
                value={form.transporter_name}
                onChange={(e) => set("transporter_name", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Godkännandenummer, transportör</Label>
              <Input
                value={form.transporter_approval_number}
                onChange={(e) => set("transporter_approval_number", e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Dokumentnummer</Label>
              <Input
                value={form.document_number}
                onChange={(e) => set("document_number", e.target.value)}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Handelsdokument, fil</Label>
              <Input ref={fileRef} type="file" className="h-9 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Notering</Label>
            <Input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-9 gap-1 text-xs"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <Upload className="h-3.5 w-3.5" />
            Registrera hämtning
          </Button>
        </Card>
      )}

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Inga hämtningar registrerade. Varje hämtning av kategori 2 eller 3 ska ha ett
          handelsdokument.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1 text-left">Datum</th>
                <th className="px-2 py-1 text-left">Kat.</th>
                <th className="px-2 py-1 text-right">Kg</th>
                <th className="px-2 py-1 text-left">Mottagare</th>
                <th className="px-2 py-1 text-left">Transportör</th>
                <th className="px-2 py-1 text-left">Dokument</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-2 py-1 font-mono tabular-nums">{r.collected_date}</td>
                  <td className="px-2 py-1">{r.category}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">
                    {r.quantity_kg ?? "—"}
                  </td>
                  <td className="px-2 py-1">
                    {r.receiver_name}
                    {r.receiver_approval_number ? ` (${r.receiver_approval_number})` : ""}
                  </td>
                  <td className="px-2 py-1">{r.transporter_name || "—"}</td>
                  <td className="px-2 py-1">
                    {r.file_path ? (
                      <button
                        onClick={() => openFile(r.file_path)}
                        className="inline-flex items-center gap-1 underline"
                      >
                        <FileText className="h-3 w-3" />
                        {r.document_number || r.file_name}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.document_number || "Fil saknas"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
