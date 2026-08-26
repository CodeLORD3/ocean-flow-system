import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

type PlanRow = {
  customer_number: string;
  fortnox_name: string | null;
  action: "already_mapped" | "map_existing" | "create_new";
  match_on?: "org_number" | "name";
  makrilltrade_customer_id?: string | null;
  makrilltrade_name?: string | null;
};

const ACTION_LABEL: Record<PlanRow["action"], string> = {
  already_mapped: "Redan kopplad",
  map_existing: "Koppla till befintlig kund",
  create_new: "Skapas som ny kund",
};

/** Importerar kunder från Fortnox (master) till Makrilltrade. Förhandsgranska först, välj sedan rader. */
export function FortnoxImportCustomersDialog({
  legalEntityCode,
  entityName,
  disabled,
}: {
  legalEntityCode: string;
  entityName: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const loadPreview = async () => {
    setLoading(true);
    setPlan(null);
    const { data, error } = await supabase.functions.invoke("fortnox-import-customers", {
      body: { legal_entity_code: legalEntityCode, mode: "preview" },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    const rows: PlanRow[] = data.plan ?? [];
    setPlan(rows);
    setSelected(new Set(rows.filter((r) => r.action !== "already_mapped").map((r) => r.customer_number)));
  };

  const openDialog = () => {
    setOpen(true);
    setSearch("");
    loadPreview();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = plan ?? [];
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fortnox_name, r.customer_number, r.makrilltrade_name].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [plan, search]);

  const toggle = (nr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(nr) ? next.delete(nr) : next.add(nr);
      return next;
    });
  };

  const runImport = async () => {
    if (selected.size === 0) return toast.error("Välj minst en kund");
    setImporting(true);
    const { data, error } = await supabase.functions.invoke("fortnox-import-customers", {
      body: { legal_entity_code: legalEntityCode, mode: "import", customer_numbers: Array.from(selected) },
    });
    setImporting(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    const s = data.summary ?? {};
    toast.success(`${s.created ?? 0} nya kunder, ${s.updated ?? 0} uppdaterade${s.failed ? `, ${s.failed} misslyckades` : ""}`);
    qc.invalidateQueries({ queryKey: ["fortnox_customer_map"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    loadPreview();
  };

  const counts = useMemo(() => {
    const rows = plan ?? [];
    return {
      create_new: rows.filter((r) => r.action === "create_new").length,
      map_existing: rows.filter((r) => r.action === "map_existing").length,
      already_mapped: rows.filter((r) => r.action === "already_mapped").length,
    };
  }, [plan]);

  return (
    <>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={openDialog}>
        <Download className="mr-1 h-3 w-3" />
        Importera kunder
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importera kunder från Fortnox – {entityName}</DialogTitle>
            <DialogDescription>
              Fortnox är master för kunddata. Kunder matchas automatiskt på organisationsnummer, annars på namn.
              Ingen kund tas bort i Makrilltrade.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : !plan ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Ingen förhandsgranskning.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">Nya: {counts.create_new}</Badge>
                <Badge variant="outline" className="text-xs">Matchade: {counts.map_existing}</Badge>
                <Badge variant="outline" className="text-xs">Redan kopplade: {counts.already_mapped}</Badge>
                <Input
                  className="h-8 max-w-[200px]"
                  placeholder="Sök kund…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() =>
                    setSelected(new Set(filtered.filter((r) => r.action !== "already_mapped").map((r) => r.customer_number)))
                  }
                >
                  Markera alla
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
                  Avmarkera
                </Button>
              </div>

              <div className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {filtered.map((r) => (
                  <label
                    key={r.customer_number}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.has(r.customer_number)}
                      disabled={r.action === "already_mapped"}
                      onCheckedChange={() => toggle(r.customer_number)}
                    />
                    <span className="w-14 shrink-0 font-mono tabular-nums text-muted-foreground">
                      #{r.customer_number}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.fortnox_name ?? "Namnlös"}</span>
                    <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">
                      {r.makrilltrade_name ? `→ ${r.makrilltrade_name}` : ""}
                      {r.match_on ? ` (${r.match_on === "org_number" ? "org.nr" : "namn"})` : ""}
                    </span>
                    <Badge
                      variant={r.action === "create_new" ? "default" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {ACTION_LABEL[r.action]}
                    </Badge>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">Inga kunder matchar sökningen.</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>Stäng</Button>
            <Button onClick={runImport} disabled={importing || loading || selected.size === 0}>
              {importing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Importera {selected.size} kunder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
