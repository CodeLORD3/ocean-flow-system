import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { FORMS, fmt } from "@/lib/filletMath";
import {
  useYields,
  useUpdateYield,
  useUpsertYield,
  useDeleteYield,
  useYieldActuals,
  useCutSplits,
  useUpsertCutSplit,
  useDeleteCutSplit,
  rollingAverage,
} from "@/hooks/useProductionYields";

export function YieldRegistry() {
  const { data: yields = [], isLoading } = useYields();
  const { data: actuals = [] } = useYieldActuals();
  const { data: splits = [] } = useCutSplits();
  const updateYield = useUpdateYield();
  const upsertYield = useUpsertYield();
  const deleteYield = useDeleteYield();
  const upsertSplit = useUpsertCutSplit();
  const deleteSplit = useDeleteCutSplit();

  const [search, setSearch] = useState("");
  const [newRow, setNewRow] = useState({ species_group: "", from_form: "hel", to_form: "filé utan skinn", yield_pct: "" });
  const [newSplit, setNewSplit] = useState({ species_group: "", detail_form: "rygg", pct_of_fillet: "", margin_weight: "1" });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yields.filter((y) => !q || y.species_group.toLowerCase().includes(q));
  }, [yields, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const y of filtered) {
      const arr = map.get(y.species_group) || [];
      arr.push(y);
      map.set(y.species_group, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [filtered]);

  const splitsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return splits.filter((s) => !q || s.species_group.toLowerCase().includes(q));
  }, [splits, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Sök art…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-52 text-xs"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} utbytesrader</span>
        <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-600">
          <AlertTriangle className="h-3 w-3" /> = branschvärde, ej kalibrerat
        </Badge>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Utbytesregister</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[11px]">Art</TableHead>
                <TableHead className="text-[11px]">Från</TableHead>
                <TableHead className="text-[11px]">Till</TableHead>
                <TableHead className="text-[11px] w-[90px] text-right">Utbyte %</TableHead>
                <TableHead className="text-[11px] w-[150px]">Uppmätt snitt (5 senaste)</TableHead>
                <TableHead className="text-[11px] w-[110px]">Status</TableHead>
                <TableHead className="text-[11px]">Anteckning</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-xs text-muted-foreground py-6 text-center">
                    Laddar…
                  </TableCell>
                </TableRow>
              )}
              {grouped.map(([species, rows]) =>
                rows.map((y, i) => {
                  const avg = rollingAverage(actuals, y.species_group, y.from_form, y.to_form);
                  const calibrated = (avg?.count ?? 0) >= 3;
                  return (
                    <TableRow key={y.id} className="h-9">
                      <TableCell className="text-[11px] font-medium">{i === 0 ? species : ""}</TableCell>
                      <TableCell className="text-[11px]">{y.from_form}</TableCell>
                      <TableCell className="text-[11px]">{y.to_form}</TableCell>
                      <TableCell className="py-0.5">
                        <Input
                          type="number"
                          step="0.1"
                          defaultValue={Number(y.yield_pct)}
                          className="h-7 text-[11px] text-right font-mono tabular-nums"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v !== Number(y.yield_pct)) updateYield.mutate({ id: y.id, yield_pct: v });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {avg ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono tabular-nums">{fmt(avg.avg, 1)} %</span>
                            <span className="text-muted-foreground">({avg.count})</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px]"
                              onClick={() => {
                                updateYield.mutate({
                                  id: y.id,
                                  yield_pct: Number(avg.avg.toFixed(1)),
                                  is_estimate: false,
                                  calibrated_count: avg.count,
                                });
                                toast({ title: "Standardvärde uppdaterat", description: `${species}: ${fmt(avg.avg, 1)} %` });
                              }}
                            >
                              Använd snitt
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {y.is_estimate && !calibrated ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> Uppskattat
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500 text-emerald-600">
                            <Check className="h-3 w-3" /> Uppmätt
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-0.5">
                        <Input
                          defaultValue={y.note ?? ""}
                          className="h-7 text-[11px]"
                          onBlur={(e) => {
                            if (e.target.value !== (y.note ?? "")) updateYield.mutate({ id: y.id, note: e.target.value });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteYield.mutate(y.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-end gap-2 border-t p-3">
            <Input
              placeholder="art"
              value={newRow.species_group}
              onChange={(e) => setNewRow({ ...newRow, species_group: e.target.value })}
              className="h-8 w-36 text-xs"
            />
            <Select value={newRow.from_form} onValueChange={(v) => setNewRow({ ...newRow, from_form: v })}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newRow.to_form} onValueChange={(v) => setNewRow({ ...newRow, to_form: v })}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}</SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="utbyte %"
              value={newRow.yield_pct}
              onChange={(e) => setNewRow({ ...newRow, yield_pct: e.target.value })}
              className="h-8 w-28 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!newRow.species_group.trim() || !newRow.yield_pct}
              onClick={() => {
                upsertYield.mutate(
                  {
                    species_group: newRow.species_group.trim().toLowerCase(),
                    from_form: newRow.from_form,
                    to_form: newRow.to_form,
                    yield_pct: parseFloat(newRow.yield_pct),
                    is_estimate: true,
                  },
                  {
                    onSuccess: () => {
                      setNewRow({ ...newRow, species_group: "", yield_pct: "" });
                      toast({ title: "Utbytesrad tillagd" });
                    },
                  }
                );
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Uppdelning av filén i detaljer (procent av filén)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[11px]">Art / mall</TableHead>
                <TableHead className="text-[11px]">Detalj</TableHead>
                <TableHead className="text-[11px] w-[110px] text-right">% av filén</TableHead>
                <TableHead className="text-[11px] w-[110px] text-right">Marginalvikt</TableHead>
                <TableHead className="text-[11px] w-[90px]">Valfri</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {splitsFiltered.map((s) => (
                <TableRow key={s.id} className="h-9">
                  <TableCell className="text-[11px] font-medium">{s.species_group}</TableCell>
                  <TableCell className="text-[11px]">{s.detail_form}</TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={Number(s.pct_of_fillet)}
                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v !== Number(s.pct_of_fillet))
                          upsertSplit.mutate({ ...s, pct_of_fillet: v } as any);
                      }}
                    />
                  </TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="number"
                      step="0.05"
                      defaultValue={Number(s.margin_weight)}
                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v !== Number(s.margin_weight))
                          upsertSplit.mutate({ ...s, margin_weight: v } as any);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-[11px]">{s.is_optional ? "Ja" : "Nej"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSplit.mutate(s.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-end gap-2 border-t p-3">
            <Input
              placeholder="art eller mall (rundfisk)"
              value={newSplit.species_group}
              onChange={(e) => setNewSplit({ ...newSplit, species_group: e.target.value })}
              className="h-8 w-48 text-xs"
            />
            <Select value={newSplit.detail_form} onValueChange={(v) => setNewSplit({ ...newSplit, detail_form: v })}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}</SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="% av filén"
              value={newSplit.pct_of_fillet}
              onChange={(e) => setNewSplit({ ...newSplit, pct_of_fillet: e.target.value })}
              className="h-8 w-28 text-xs"
            />
            <Input
              type="number"
              step="0.05"
              placeholder="marginalvikt"
              value={newSplit.margin_weight}
              onChange={(e) => setNewSplit({ ...newSplit, margin_weight: e.target.value })}
              className="h-8 w-28 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!newSplit.species_group.trim() || !newSplit.pct_of_fillet}
              onClick={() =>
                upsertSplit.mutate(
                  {
                    species_group: newSplit.species_group.trim().toLowerCase(),
                    detail_form: newSplit.detail_form,
                    pct_of_fillet: parseFloat(newSplit.pct_of_fillet),
                    margin_weight: parseFloat(newSplit.margin_weight) || 1,
                  } as any,
                  { onSuccess: () => setNewSplit({ ...newSplit, species_group: "", pct_of_fillet: "" }) }
                )
              }
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
