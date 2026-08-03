import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStores } from "@/hooks/useStores";
import {
  useProcessingSurcharges,
  useMarginTargets,
  useVatRates,
  useUpdateSetting,
} from "@/hooks/useProductionYields";
import { YieldCoverageCheck } from "./YieldCoverageCheck";

export function ProductionSettings() {
  const { data: surcharges = [] } = useProcessingSurcharges();
  const { data: margins = [] } = useMarginTargets();
  const { data: vats = [] } = useVatRates();
  const { data: stores = [] } = useStores();
  const updSurcharge = useUpdateSetting("processing_surcharges");
  const updMargin = useUpdateSetting("margin_targets");
  const updVat = useUpdateSetting("vat_rates");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Förädlingspåslag per kategori (kr/färdigt kg)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[11px]">Kategori</TableHead>
                <TableHead className="text-[11px] w-[110px] text-right">kr/kg</TableHead>
                <TableHead className="text-[11px] w-[90px]">Gäller</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surcharges.map((s) => (
                <TableRow key={s.id} className="h-9">
                  <TableCell className="text-[11px]">{s.category}</TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="number"
                      defaultValue={Number(s.surcharge_per_kg)}
                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v !== Number(s.surcharge_per_kg)) updSurcharge.mutate({ id: s.id, surcharge_per_kg: v });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={s.applies}
                      onCheckedChange={(v) => updSurcharge.mutate({ id: s.id, applies: v })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Marginalmål per region</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[11px]">Region</TableHead>
                <TableHead className="text-[11px]">Butiker</TableHead>
                <TableHead className="text-[11px] w-[110px] text-right">Mål %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {margins.map((m) => (
                <TableRow key={m.id} className="h-9">
                  <TableCell className="text-[11px] font-medium">{m.label || m.region}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {stores.filter((s) => s.region === m.region).map((s) => s.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="number"
                      step="0.5"
                      defaultValue={Number(m.target_pct)}
                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v !== Number(m.target_pct)) updMargin.mutate({ id: m.id, target_pct: v });
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Momssatser (per kategori, med giltighetsdatum)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[11px]">Kategori</TableHead>
                <TableHead className="text-[11px] w-[100px] text-right">Sats %</TableHead>
                <TableHead className="text-[11px] w-[140px]">Från</TableHead>
                <TableHead className="text-[11px] w-[140px]">Till</TableHead>
                <TableHead className="text-[11px]">Anteckning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vats.map((v) => (
                <TableRow key={v.id} className="h-9">
                  <TableCell className="text-[11px]">{v.category === "*" ? "Livsmedel (standard)" : v.category}</TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="number"
                      step="0.5"
                      defaultValue={Number(v.rate)}
                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val !== Number(v.rate)) updVat.mutate({ id: v.id, rate: val });
                      }}
                    />
                  </TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="date"
                      defaultValue={v.valid_from}
                      className="h-7 text-[11px]"
                      onBlur={(e) => e.target.value !== v.valid_from && updVat.mutate({ id: v.id, valid_from: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      type="date"
                      defaultValue={v.valid_to ?? ""}
                      className="h-7 text-[11px]"
                      onBlur={(e) =>
                        e.target.value !== (v.valid_to ?? "") && updVat.mutate({ id: v.id, valid_to: e.target.value || null })
                      }
                    />
                  </TableCell>
                  <TableCell className="py-0.5">
                    <Input
                      defaultValue={v.note ?? ""}
                      className="h-7 text-[11px]"
                      onBlur={(e) => e.target.value !== (v.note ?? "") && updVat.mutate({ id: v.id, note: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <YieldCoverageCheck />

    </div>
  );
}
