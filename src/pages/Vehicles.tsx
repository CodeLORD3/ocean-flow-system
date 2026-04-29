import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Columns3, Truck, CalendarIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Vehicle = {
  id: string;
  reg_number: string;
  make: string | null;
  status: string | null;
  model_year: number | null;
  finance: string | null;
  fault: string | null;
  comment: string | null;
  next_service: string | null;
  odometer: string | null;
  odometer_updated_at: string | null;
  cooling_service: string | null;
  extra: Record<string, any>;
  sort_order: number;
};

type ExtraColumn = {
  id: string;
  key: string;
  label: string;
  col_type: string;
  sort_order: number;
};

const CORE_COLUMNS: { key: keyof Vehicle; label: string }[] = [
  { key: "reg_number", label: "REG NUMMER" },
  { key: "make", label: "FABRIKAT" },
  { key: "status", label: "STATUS" },
  { key: "model_year", label: "ÅRSMODELL" },
  { key: "finance", label: "FINANS" },
  { key: "fault", label: "FEL" },
  { key: "comment", label: "KOMMENTAR" },
  { key: "next_service", label: "NÄSTA SERVICE" },
  { key: "odometer", label: "MÄTARSTÄLLNING (senast uppdaterad)" },
  { key: "cooling_service", label: "SERVICE PÅ KYLAGGREGAT" },
];

const STATUS_OPTIONS = [
  { value: "Fungerar", dotClass: "bg-emerald-500", textClass: "text-emerald-400" },
  { value: "Underhåll krävs", dotClass: "bg-amber-500", textClass: "text-amber-400" },
  { value: "Trasig", dotClass: "bg-red-500", textClass: "text-red-400" },
  { value: "Bokad Service", dotClass: "bg-gray-400", textClass: "text-gray-400" },
] as const;

function statusMeta(status: string | null) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("bokad") || s.includes("service")) return STATUS_OPTIONS[3];
  if (s.includes("fungerar") || s === "ok" || s.includes("aktiv")) return STATUS_OPTIONS[0];
  if (s.includes("underhåll")) return STATUS_OPTIONS[1];
  if (s.includes("trasig")) return STATUS_OPTIONS[2];
  return null;
}

function StatusPill({ status }: { status: string | null }) {
  const meta = statusMeta(status);
  if (!status) return <span className="text-muted-foreground text-[10px]">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[7px] leading-none", meta?.textClass)}>
      <span className={cn("h-1 w-1 rounded-full", meta?.dotClass ?? "bg-muted-foreground")} />
      {status}
    </span>
  );
}

export default function Vehicles() {
  const qc = useQueryClient();

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const { data: extraCols = [] } = useQuery({
    queryKey: ["vehicle_columns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_columns")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExtraColumn[];
    },
  });

  const updateVehicle = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Vehicle> }) => {
      const { error } = await supabase.from("vehicles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const updateExtra = useMutation({
    mutationFn: async ({ id, key, value }: { id: string; key: string; value: any }) => {
      const v = vehicles.find((x) => x.id === id);
      const newExtra = { ...(v?.extra || {}), [key]: value };
      const { error } = await supabase.from("vehicles").update({ extra: newExtra }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const deleteVehicle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Bil borttagen");
    },
  });

  const addVehicle = useMutation({
    mutationFn: async (reg: string) => {
      const maxSort = vehicles.reduce((m, v) => Math.max(m, v.sort_order ?? 0), 0);
      const { error } = await supabase.from("vehicles").insert({
        reg_number: reg,
        sort_order: maxSort + 1,
        extra: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Bil tillagd");
    },
  });

  const addColumn = useMutation({
    mutationFn: async ({ label }: { label: string }) => {
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `col_${Date.now()}`;
      const maxSort = extraCols.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
      const { error } = await supabase.from("vehicle_columns").insert({
        key, label, col_type: "text", sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle_columns"] });
      toast.success("Kolumn tillagd");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte lägga till kolumn"),
  });

  const deleteColumn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle_columns"] });
      toast.success("Kolumn borttagen");
    },
  });

  const [newReg, setNewReg] = useState("");
  const [newColLabel, setNewColLabel] = useState("");
  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Truck className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Bilar</h1>
            <p className="text-xs text-muted-foreground">Fordonsstatus och underhåll</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4 mr-1" /> Hantera kolumner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Anpassade kolumner</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Lägg till ny kolumn</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Kolumnens namn"
                      value={newColLabel}
                      onChange={(e) => setNewColLabel(e.target.value)}
                    />
                    <Button
                      onClick={() => {
                        if (!newColLabel.trim()) return;
                        addColumn.mutate(
                          { label: newColLabel.trim() },
                          { onSuccess: () => setNewColLabel("") }
                        );
                      }}
                    >
                      Lägg till
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 max-h-64 overflow-auto">
                  {extraCols.length === 0 && (
                    <p className="text-xs text-muted-foreground">Inga anpassade kolumner än.</p>
                  )}
                  {extraCols.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm">{c.label}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteColumn.mutate(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Ny bil
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ny bil</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Registreringsnummer</Label>
                <Input
                  placeholder="ABC123"
                  value={newReg}
                  onChange={(e) => setNewReg(e.target.value.toUpperCase())}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (!newReg.trim()) return;
                    addVehicle.mutate(newReg.trim(), {
                      onSuccess: () => {
                        setNewReg("");
                        setAddDialogOpen(false);
                      },
                    });
                  }}
                >
                  Lägg till
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b">
            <tr>
              {CORE_COLUMNS.map((c) => (
                <th key={c.key as string} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              {extraCols.map((c) => (
                <th key={c.id} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                  {c.label.toUpperCase()}
                </th>
              ))}
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={CORE_COLUMNS.length + extraCols.length + 1} className="text-center py-8 text-muted-foreground">
                  Inga bilar registrerade än.
                </td>
              </tr>
            )}
            {vehicles.map((v) => (
              <tr key={v.id} className="border-b hover:bg-muted/20 group">
                {CORE_COLUMNS.map((c) => {
                  const value = v[c.key] as any;
                  if (c.key === "status") {
                    return (
                      <td key={c.key as string} className="px-3 py-1.5">
                        <Select
                          value={value ?? ""}
                          onValueChange={(val) => updateVehicle.mutate({ id: v.id, patch: { status: val } })}
                        >
                          <SelectTrigger className="h-6 w-auto min-w-[90px] px-2 py-0 text-[8px] border-none bg-transparent hover:bg-muted/40 [&>svg]:h-2.5 [&>svg]:w-2.5">
                            <SelectValue placeholder="—">
                              <StatusPill status={value} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                <span className="inline-flex items-center gap-2">
                                  <span className={cn("h-2 w-2 rounded-full", opt.dotClass)} />
                                  {opt.value}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  }
                  if (c.key === "next_service") {
                    return (
                      <td key={c.key as string} className="px-3 py-1.5">
                        <DateCell
                          value={value}
                          onSave={(val) => updateVehicle.mutate({ id: v.id, patch: { next_service: val } })}
                        />
                      </td>
                    );
                  }
                  if (c.key === "odometer") {
                    return (
                      <td key={c.key as string} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <CellEditor
                            value={value ?? ""}
                            onSave={(val) => updateVehicle.mutate({ id: v.id, patch: { odometer: val || null } })}
                          />
                          <DateCell
                            value={v.odometer_updated_at}
                            compact
                            onSave={(val) => updateVehicle.mutate({ id: v.id, patch: { odometer_updated_at: val } })}
                          />
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key as string} className={cn(
                      "px-3 py-1.5",
                      c.key === "reg_number" && "font-mono font-semibold"
                    )}>
                      <CellEditor
                        value={value ?? ""}
                        type={c.key === "model_year" ? "number" : "text"}
                        onSave={(val) => {
                          const patch: any = {};
                          if (c.key === "model_year") {
                            patch[c.key] = val ? Number(val) : null;
                          } else {
                            patch[c.key] = val || null;
                          }
                          updateVehicle.mutate({ id: v.id, patch });
                        }}
                      />
                    </td>
                  );
                })}
                {extraCols.map((c) => (
                  <td key={c.id} className="px-3 py-1.5">
                    <CellEditor
                      value={v.extra?.[c.key] ?? ""}
                      onSave={(val) => updateExtra.mutate({ id: v.id, key: c.key, value: val })}
                    />
                  </td>
                ))}
                <td className="px-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      if (confirm(`Ta bort bil ${v.reg_number}?`)) deleteVehicle.mutate(v.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellEditor({
  value,
  onSave,
  type = "text",
  render,
}: {
  value: string | number;
  onSave: (val: string) => void;
  type?: "text" | "number";
  render?: (val: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value ?? ""));

  useEffect(() => setVal(String(value ?? "")), [value]);

  if (editing) {
    return (
      <Input
        autoFocus
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (val !== String(value ?? "")) onSave(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setVal(String(value ?? ""));
            setEditing(false);
          }
        }}
        className="h-7 text-xs"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left w-full min-h-[1.25rem] hover:bg-muted/40 rounded px-1 -mx-1"
    >
      {render
        ? render(String(value ?? ""))
        : value
        ? String(value)
        : <span className="text-muted-foreground">—</span>}
    </button>
  );
}
