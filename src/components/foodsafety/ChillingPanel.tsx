import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";

/**
 * Nedkylning av kokta skaldjur, kopplad till partiet.
 * Databasen bedömer resultatet: över åtta grader eller längre än fyra timmar
 * blir en avvikelse automatiskt.
 */
export default function ChillingPanel() {
  const qc = useQueryClient();
  const [lotId, setLotId] = useState("");
  const [search, setSearch] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [startTemp, setStartTemp] = useState("");
  const [endTemp, setEndTemp] = useState("");
  const [comment, setComment] = useState("");

  const { data: lots = [] } = useQuery({
    queryKey: ["lots_for_chilling"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, lot_number, commercial_name, products(name)")
        .eq("status", "aktiv")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["chilling_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chilling_records" as any)
        .select("*, lots(lot_number, products(name))")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const options = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = lots.map((l) => ({
      id: l.id,
      label: `${l.lot_number} — ${l.products?.name || l.commercial_name || "parti"}`,
    }));
    return s ? list.filter((o) => o.label.toLowerCase().includes(s)).slice(0, 20) : list.slice(0, 20);
  }, [lots, search]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const { data, error } = await supabase
        .from("chilling_records" as any)
        .insert({
          lot_id: lotId,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          start_temp_c: startTemp === "" ? null : Number(startTemp.replace(",", ".")),
          end_temp_c: Number(endTemp.replace(",", ".")),
          comment: comment || null,
          recorded_by: (staff as any)?.id ?? null,
        })
        .select("status")
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (rec) => {
      if (rec?.status === "avvikelse") {
        toast.warning("Nedkylningen är registrerad som avvikelse — följ upp under Avvikelser.");
      } else {
        toast.success("Nedkylningen är godkänd och sparad.");
      }
      setStartAt("");
      setEndAt("");
      setStartTemp("");
      setEndTemp("");
      setComment("");
      qc.invalidateQueries({ queryKey: ["chilling_records"] });
      qc.invalidateQueries({ queryKey: ["deviations"] });
    },
    onError: (e: any) => toast.error(e.message || "Nedkylningen kunde inte sparas."),
  });

  const submit = () => {
    if (!lotId) return toast.error("Välj vilket parti nedkylningen gäller.");
    if (!startAt || !endAt) return toast.error("Ange start- och sluttid.");
    if (endTemp.trim() === "") return toast.error("Ange sluttemperaturen.");
    save.mutate();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-card p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          Kokta skaldjur ska kylas till åtta grader inom fyra timmar. Registrera per parti, så
          skapas en avvikelse automatiskt om gränsen överskrids.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-[11px]">Parti</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök partinummer eller produkt"
              className="h-8 text-xs"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setLotId(o.id)}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    lotId === o.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Start</Label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Slut</Label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Temp start</Label>
              <Input
                value={startTemp}
                onChange={(e) => setStartTemp(e.target.value)}
                inputMode="decimal"
                className="h-9 font-mono text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Temp slut</Label>
              <Input
                value={endTemp}
                onChange={(e) => setEndTemp(e.target.value)}
                inputMode="decimal"
                className="h-9 font-mono text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-[11px]">Kommentar</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <Button size="sm" className="mt-2 h-9 text-xs" onClick={submit} disabled={save.isPending}>
          Registrera nedkylning
        </Button>
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={<Snowflake className="h-4 w-4" />}
          title="Inga nedkylningar registrerade"
          description="Registrera kokning och nedkylning per parti, så finns tid och temperatur kvar i spårbarheten."
        />
      ) : (
        <div className="divide-y rounded-md border border-border bg-card">
          {records.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-2 text-xs">
              <span className="font-mono text-[11px] text-muted-foreground">
                {r.lots?.lot_number ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.lots?.products?.name ?? "Parti"}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {r.duration_minutes} min
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">{r.end_temp_c} grader</span>
              <Badge
                variant={r.status === "avvikelse" ? "destructive" : "outline"}
                className="text-[10px]"
              >
                {r.status === "avvikelse" ? "Avvikelse" : "Godkänd"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
