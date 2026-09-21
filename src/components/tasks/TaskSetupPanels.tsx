import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PART_LABELS, minutesText, partsSum } from "@/lib/taskStandardTime";
import { useSaveTaskCheckpoints, useTaskCheckpoints } from "@/hooks/useTaskRun";
import { useSaveStandardTime, useStandardTime } from "@/hooks/useStandardTime";
import {
  useDeleteRequirement,
  useResourceItems,
  useSaveRequirement,
  useSaveStoreMapping,
  useStoreResourceMappings,
  useTaskRequirements,
} from "@/hooks/useResources";

/** Kontrollpunkterna som personalen bockar i Genomför. */
export function CheckpointEditor({ templateItemId }: { templateItemId: string }) {
  const { data: saved = [] } = useTaskCheckpoints(templateItemId);
  const save = useSaveTaskCheckpoints();
  const [rows, setRows] = useState<{ id?: string; label: string; required: boolean }[]>([]);

  useEffect(() => {
    setRows(saved.map((c) => ({ id: c.id, label: c.label, required: c.required })));
  }, [saved]);

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
          <Input
            value={r.label}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            placeholder="T.ex. Golvet städat"
          />
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Checkbox
              checked={r.required}
              onCheckedChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, required: !!v } : x)))}
            />
            måste
          </label>
          <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { label: "", required: true }])}>
          <Plus className="mr-1 h-4 w-4" /> Lägg till punkt
        </Button>
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={async () => {
            await save.mutateAsync({ templateItemId, labels: rows });
            toast({ title: "Kontrollpunkterna sparade" });
          }}
        >
          Spara
        </Button>
      </div>
    </div>
  );
}

/** Standardtiden i fem delar. */
export function StandardTimeEditor({ templateItemId }: { templateItemId: string }) {
  const { data } = useStandardTime(templateItemId);
  const save = useSaveStandardTime();
  const COLS = {
    fetch: "std_fetch_minutes",
    prepare: "std_prepare_minutes",
    doWork: "std_do_minutes",
    check: "std_check_minutes",
    restore: "std_restore_minutes",
  } as const;

  const parts = {
    fetch: data?.std_fetch_minutes ?? null,
    prepare: data?.std_prepare_minutes ?? null,
    doWork: data?.std_do_minutes ?? null,
    check: data?.std_check_minutes ?? null,
    restore: data?.std_restore_minutes ?? null,
  };
  const sum = partsSum(parts);

  return (
    <div className="space-y-2">
      {PART_LABELS.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <span className="w-40 shrink-0 text-sm text-muted-foreground">{p.label}</span>
          <Input
            inputMode="numeric"
            className="w-24"
            defaultValue={parts[p.key] ?? ""}
            onBlur={(e) =>
              save.mutate({
                templateItemId,
                [COLS[p.key]]: e.target.value === "" ? null : Number(e.target.value),
              } as any)
            }
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
      ))}
      <p className="font-mono text-sm tabular-nums">Standardtid {minutesText(sum) ?? "—"}</p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!!data?.auto_start}
          onCheckedChange={(v) => save.mutate({ templateItemId, auto_start: !!v })}
        />
        Starta tiden automatiskt när uppgiften öppnas
      </label>
    </div>
  );
}

/**
 * Vad arbetet kräver (standardens krav) och vilken sak just den här butiken
 * använder. Platsen skrivs aldrig här — den bor i registret.
 */
export function RequirementEditor({
  templateItemId,
  checklistItemId,
  storeId,
}: {
  templateItemId: string | null;
  checklistItemId: string;
  storeId: string | null;
}) {
  const { data: requirements = [] } = useTaskRequirements(templateItemId, checklistItemId);
  const { data: resources = [] } = useResourceItems();
  const { data: mappings = [] } = useStoreResourceMappings(storeId);
  const saveReq = useSaveRequirement();
  const removeReq = useDeleteRequirement();
  const saveMapping = useSaveStoreMapping();
  const [name, setName] = useState("");

  return (
    <div className="space-y-2">
      {requirements.map((r) => {
        const mapped = mappings.find((m) => m.requirement_id === r.id);
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="text-sm font-medium">{r.requirement_name}</span>
            {storeId && (
              <Select
                value={mapped?.resource_id ?? "none"}
                onValueChange={(v) =>
                  saveMapping.mutate({ requirementId: r.id, storeId, resourceId: v === "none" ? null : v })
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Butikens sak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inte vald</SelectItem>
                  {resources.map((res) => (
                    <SelectItem key={res.id} value={res.id}>
                      {res.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => removeReq.mutate(r.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="T.ex. Golvmopp" />
        <Button
          variant="outline"
          onClick={async () => {
            if (!name.trim()) return;
            await saveReq.mutateAsync({
              templateItemId,
              checklistItemId,
              requirementName: name,
              sortOrder: requirements.length,
            });
            setName("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Lägg till
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Skriv vad arbetet kräver — inte fabrikat eller plats. Platsen hämtas från Utrustning &amp; material.
      </p>
    </div>
  );
}
