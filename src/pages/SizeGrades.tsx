import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ruler, Save, Plus, ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { useProducts } from "@/hooks/useProducts";
import {
  useSizeGrades,
  useSaveSizeGrade,
  useDeleteSizeGrade,
  useLotsOnBlockedProducts,
  useReclassifyLot,
} from "@/hooks/useSizeGrades";
import { gradeRangeText, gradesForSpecies, type SizeGrade } from "@/lib/sizeGrades";
import { speciesKey } from "@/lib/asciiFold";

const numOrNull = (v: string) => {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function GradeRow({ grade }: { grade: SizeGrade }) {
  const save = useSaveSizeGrade();
  const del = useDeleteSizeGrade();
  const [draft, setDraft] = useState<SizeGrade>(grade);
  const dirty = JSON.stringify(draft) !== JSON.stringify(grade);

  const field = (key: keyof SizeGrade, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <TableRow className="h-9">
      <TableCell className="px-2 py-1 text-xs font-medium">{draft.grade_no}</TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 w-24 text-xs"
          value={draft.label ?? ""}
          onChange={(e) => field("label", e.target.value)}
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 w-20 text-right text-xs tabular-nums"
          value={draft.min_weight_kg ?? ""}
          onChange={(e) => field("min_weight_kg", numOrNull(e.target.value))}
          placeholder="—"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 w-20 text-right text-xs tabular-nums"
          value={draft.max_weight_kg ?? ""}
          onChange={(e) => field("max_weight_kg", numOrNull(e.target.value))}
          placeholder="—"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 w-20 text-right text-xs tabular-nums"
          value={draft.min_count_per_kg ?? ""}
          onChange={(e) => field("min_count_per_kg", numOrNull(e.target.value))}
          placeholder="—"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 w-20 text-right text-xs tabular-nums"
          value={draft.max_count_per_kg ?? ""}
          onChange={(e) => field("max_count_per_kg", numOrNull(e.target.value))}
          placeholder="—"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          className="h-7 text-xs"
          value={draft.note ?? ""}
          onChange={(e) => field("note", e.target.value)}
        />
      </TableCell>
      <TableCell className="px-2 py-1 text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant={dirty ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(draft as any, {
                onSuccess: () => toast({ title: "Sparat", description: `Klass ${draft.grade_no} uppdaterad.` }),
                onError: (e: any) => toast({ title: "Fel", description: e.message, variant: "destructive" }),
              })
            }
          >
            <Save className="mr-1 h-3 w-3" /> Spara
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Ta bort klassen"
            onClick={() => {
              if (!confirm(`Ta bort klass ${draft.grade_no}?`)) return;
              del.mutate(grade.id, {
                onError: (e: any) => toast({ title: "Fel", description: e.message, variant: "destructive" }),
              });
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SpeciesCard({ species, grades, variants }: { species: string; grades: SizeGrade[]; variants: any[] }) {
  const save = useSaveSizeGrade();
  const nextNo = grades.length ? Math.max(...grades.map((g) => g.grade_no)) + 1 : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-sm capitalize">{species}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {variants.length} storleksvarianter
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() =>
              save.mutate({ species_group: species, grade_no: nextNo, label: String(nextNo) })
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Ny klass
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <Table>
          <TableHeader>
            <TableRow className="h-8">
              <TableHead className="px-2 text-[11px]">Klass</TableHead>
              <TableHead className="px-2 text-[11px]">Etikett</TableHead>
              <TableHead className="px-2 text-[11px]">Min kg</TableHead>
              <TableHead className="px-2 text-[11px]">Max kg</TableHead>
              <TableHead className="px-2 text-[11px]">Min st/kg</TableHead>
              <TableHead className="px-2 text-[11px]">Max st/kg</TableHead>
              <TableHead className="px-2 text-[11px]">Anteckning</TableHead>
              <TableHead className="px-2 text-right text-[11px]">Åtgärd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.map((g) => (
              <GradeRow key={g.id} grade={g} />
            ))}
          </TableBody>
        </Table>
        {variants.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {variants.map((v) => (
              <Badge key={v.id} variant="secondary" className="text-[10px] font-normal">
                {v.sku} · {v.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReclassPanel() {
  const { data: lots = [], isLoading } = useLotsOnBlockedProducts();
  const { data: products = [] } = useProducts();
  const { data: grades = [] } = useSizeGrades();
  const reclass = useReclassifyLot();
  const [choice, setChoice] = useState<Record<string, string>>({});

  const variantsFor = (species: string | null | undefined) =>
    products.filter(
      (p: any) =>
        p.size_grade_id &&
        p.purchasable !== false &&
        speciesKey(p.species_group) === speciesKey(species),
    );

  const gradeText = (product: any) => {
    const g = grades.find((x) => x.id === product.size_grade_id);
    return g ? `${product.name} (${gradeRangeText(g)})` : product.name;
  };

  if (isLoading) return <p className="text-xs text-muted-foreground">Läser in partier…</p>;

  if (lots.length === 0) {
    return (
      <EmptyState
        icon={<ArrowRightLeft className="h-4 w-4" />}
        title="Inga partier att klassa om"
        description="Alla partier med kvarvarande saldo ligger på en storleksvariant eller på en produkt utan sorteringsregister."
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Partier med kvarvarande saldo som ligger på en spärrad grundprodukt. Omklassningen bokförs som
        lagerrörelse ut från grundprodukten och in på varianten, med partinummer, partipris och
        spårbarhet bevarade.
      </p>
      <Table>
        <TableHeader>
          <TableRow className="h-8">
            <TableHead className="px-2 text-[11px]">Parti</TableHead>
            <TableHead className="px-2 text-[11px]">Ligger på</TableHead>
            <TableHead className="px-2 text-right text-[11px]">Saldo kg</TableHead>
            <TableHead className="px-2 text-right text-[11px]">kr/kg</TableHead>
            <TableHead className="px-2 text-[11px]">Lagerplats</TableHead>
            <TableHead className="px-2 text-[11px]">Klassa om till</TableHead>
            <TableHead className="px-2 text-right text-[11px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lots.map((l: any) => {
            const variants = variantsFor(l.product?.species_group);
            return (
              <TableRow key={l.id} className="h-9">
                <TableCell className="px-2 py-1 font-mono text-[11px]">{l.lot_number}</TableCell>
                <TableCell className="px-2 py-1 text-xs">
                  {l.product?.name}{" "}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    ej inköpsbar
                  </Badge>
                </TableCell>
                <TableCell className="px-2 py-1 text-right text-xs tabular-nums">
                  {l.remaining_kg.toLocaleString("sv-SE")}
                </TableCell>
                <TableCell className="px-2 py-1 text-right text-xs tabular-nums">
                  {Number(l.unit_cost || 0).toLocaleString("sv-SE")}
                </TableCell>
                <TableCell className="px-2 py-1 text-[11px] text-muted-foreground">
                  {l.locations.join(", ") || "—"}
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Select value={choice[l.id] ?? ""} onValueChange={(v) => setChoice((c) => ({ ...c, [l.id]: v }))}>
                    <SelectTrigger className="h-7 w-[260px] text-xs">
                      <SelectValue placeholder="Välj storlek" />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((v: any) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          {gradeText(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="px-2 py-1 text-right">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={!choice[l.id] || reclass.isPending}
                    onClick={() =>
                      reclass.mutate(
                        { lotId: l.id, productId: choice[l.id] },
                        {
                          onSuccess: (res: any) =>
                            toast({
                              title: "Parti omklassat",
                              description: `${l.lot_number}: ${Number(res?.kg || 0).toLocaleString("sv-SE")} kg flyttade till ${
                                variants.find((v: any) => v.id === choice[l.id])?.name ?? "varianten"
                              }.`,
                            }),
                          onError: (e: any) =>
                            toast({ title: "Fel", description: e.message, variant: "destructive" }),
                        },
                      )
                    }
                  >
                    <ArrowRightLeft className="mr-1 h-3 w-3" /> Klassa om
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Admin: sorteringsregister per artgrupp och omklassning av befintliga partier. */
export default function SizeGrades() {
  const { data: grades = [], isLoading } = useSizeGrades();
  const { data: products = [] } = useProducts();
  const [q, setQ] = useState("");

  const speciesList = useMemo(() => {
    const keys = Array.from(new Set(grades.map((g) => speciesKey(g.species_group)))).sort();
    return keys.filter((s) => !q.trim() || s.includes(speciesKey(q)));
  }, [grades, q]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Ruler className="h-4 w-4" /> Storlekssortering
        </h1>
        <p className="text-xs text-muted-foreground">
          Sorteringsklasser per artgrupp enligt EU:s handelsnormer (2406/96). Klasserna styr vilka
          storleksvarianter som får köpas in och hur följesedelsrader matchas.
        </p>
      </div>
      <Tabs defaultValue="register" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-auto self-start">
          <TabsTrigger value="register" className="text-xs">Sorteringsregister</TabsTrigger>
          <TabsTrigger value="reclass" className="text-xs">Omklassning av partier</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="register" className="mt-0 space-y-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sök artgrupp"
              className="h-8 max-w-xs text-xs"
            />
            {isLoading && <p className="text-xs text-muted-foreground">Läser in registret…</p>}
            {speciesList.map((s) => (
              <SpeciesCard
                key={s}
                species={s}
                grades={gradesForSpecies(grades, s)}
                variants={products.filter(
                  (p: any) => p.size_grade_id && speciesKey(p.species_group) === s,
                )}
              />
            ))}
          </TabsContent>
          <TabsContent value="reclass" className="mt-0">
            <ReclassPanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
