import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  LineChart as LineChartIcon,
  Plus,
  Ruler,
  Save,
  Thermometer,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import ChillingPanel from "@/components/foodsafety/ChillingPanel";
import AbpPanel from "@/components/foodsafety/AbpPanel";
import {
  CONTROL_CATEGORIES,
  FREQUENCIES,
  daysUntil,
  requirementStatus,
  useComplianceRequirements,
  useControlPoints,
  useControlTrend,
  useDeviations,
  useInstruments,
  useRegisterMeasurement,
  useSaveControlPoint,
  useSaveDeviation,
  useSaveInstrument,
  useSaveRequirement,
  useSeedBaseline,
  useSeedLocationTemperaturePoints,
  useTodaysRecords,
  type ControlPoint,
  type Deviation,
} from "@/hooks/useFoodSafety";

const dateFmt = (v: string | null) => (v ? new Date(v).toLocaleDateString("sv-SE") : "—");

export default function FoodSafety() {
  const { data: points = [], isLoading } = useControlPoints();
  const { data: todays = [] } = useTodaysRecords();
  const { data: openDeviations = [] } = useDeviations(false);
  const { data: requirements = [] } = useComplianceRequirements();
  const { data: instruments = [] } = useInstruments();

  const register = useRegisterMeasurement();
  const savePoint = useSaveControlPoint();
  const saveDeviation = useSaveDeviation();
  const saveRequirement = useSaveRequirement();
  const saveInstrument = useSaveInstrument();
  const seed = useSeedBaseline();
  const seedTemps = useSeedLocationTemperaturePoints();

  const [values, setValues] = useState<Record<string, string>>({});
  const [pointForm, setPointForm] = useState<Partial<ControlPoint> | null>(null);
  const [devForm, setDevForm] = useState<(Partial<Deviation> & { close?: boolean }) | null>(null);
  const [reqForm, setReqForm] = useState<any>(null);
  const [instForm, setInstForm] = useState<any>(null);
  const [trendPoint, setTrendPoint] = useState<ControlPoint | null>(null);

  const doneToday = useMemo(() => new Set(todays.map((r) => r.control_point_id)), [todays]);

  const dueToday = points.filter((p) => p.frequency === "dagligen" || !doneToday.has(p.id));
  const soon = requirements.filter((r) => {
    const s = requirementStatus(r.next_due);
    return s === "snart" || s === "forfallen";
  });

  const saveMeasurement = async (p: ControlPoint, boolValue?: boolean) => {
    const raw = values[p.id];
    const isBool = p.unit === "ja/nej";
    if (!isBool && (raw === undefined || raw.trim() === "")) {
      toast.error("Fyll i ett värde först.");
      return;
    }
    try {
      const rec = await register.mutateAsync({
        controlPointId: p.id,
        valueNumeric: isBool ? null : Number(raw.replace(",", ".")),
        valueBool: isBool ? !!boolValue : null,
        instrumentId: p.instrument_id ?? null,
      });
      setValues((v) => ({ ...v, [p.id]: "" }));
      if (rec.status === "avvikelse") {
        toast.warning("Värdet ligger utanför gränsen — en avvikelse har skapats.");
      } else {
        toast.success("Mätningen är registrerad.");
      }
    } catch (e: any) {
      toast.error(e.message || "Mätningen kunde inte sparas.");
    }
  };

  const doSaveDeviation = async () => {
    if (!devForm?.description?.trim()) {
      toast.error("Avvikelsen behöver en beskrivning.");
      return;
    }
    try {
      await saveDeviation.mutateAsync(devForm);
      toast.success(devForm.close ? "Avvikelsen är stängd." : "Avvikelsen är sparad.");
      setDevForm(null);
    } catch (e: any) {
      toast.error(e.message || "Avvikelsen kunde inte sparas.");
    }
  };

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Egenkontroll</h1>
          <p className="text-xs text-muted-foreground">
            Mätningar, avvikelser och lagkrav. Ett värde utanför gränsen skapar automatiskt en avvikelse.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={async () => {
              try {
                const r = await seed.mutateAsync();
                toast.success(`Lade upp ${r.requirements} lagkrav och ${r.points} kontrollpunkter.`);
              } catch (e: any) {
                toast.error(e.message || "Grundförutsättningarna kunde inte läggas upp.");
              }
            }}
            disabled={seed.isPending}
          >
            Grundförutsättningar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={async () => {
              try {
                const n = await seedTemps.mutateAsync();
                toast.success(
                  n === 0
                    ? "Alla lagerplatser har redan en temperaturpunkt."
                    : `Skapade ${n} temperaturpunkter, en per lagerplats.`,
                );
              } catch (e: any) {
                toast.error(e.message || "Temperaturpunkterna kunde inte skapas.");
              }
            }}
            disabled={seedTemps.isPending}
          >
            Lagertemperaturer
          </Button>
          <Button size="sm" className="gap-1 text-xs" onClick={() => setPointForm({ active: true })}>
            <Plus className="h-3.5 w-3.5" /> Kontrollpunkt
          </Button>
        </div>
      </div>

      <Tabs defaultValue="today">
        <TabsList className="h-9">
          <TabsTrigger value="today" className="text-xs">
            Att göra idag
          </TabsTrigger>
          <TabsTrigger value="deviations" className="text-xs">
            Avvikelser {openDeviations.length > 0 && `(${openDeviations.length})`}
          </TabsTrigger>
          <TabsTrigger value="due" className="text-xs">
            Förfaller snart {soon.length > 0 && `(${soon.length})`}
          </TabsTrigger>
          <TabsTrigger value="chilling" className="text-xs">
            Nedkylning
          </TabsTrigger>
          <TabsTrigger value="abp" className="text-xs">
            Biprodukter
          </TabsTrigger>
          <TabsTrigger value="instruments" className="text-xs">
            Instrument
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Hämtar kontrollpunkter…</p>
          ) : points.length === 0 ? (
            <EmptyState
              icon={<Thermometer className="h-4 w-4" />}
              title="Inga kontrollpunkter upplagda"
              description="Lägg upp kylrum, frysrum och rengöringsrutiner som kontrollpunkter, eller tryck på Grundförutsättningar för att lägga upp de lagstadgade posterna."
            />
          ) : (
            dueToday.map((p) => {
              const done = doneToday.has(p.id);
              const isBool = p.unit === "ja/nej";
              return (
                <div
                  key={p.id}
                  className={`rounded-md border p-2 ${done ? "border-border bg-muted/40" : "border-border bg-card"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.category} · {p.frequency} ·{" "}
                        {p.limit_min !== null || p.limit_max !== null
                          ? `gräns ${p.limit_min ?? "—"} till ${p.limit_max ?? "—"} ${p.unit}`
                          : p.unit}
                      </p>
                    </div>
                    {done && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" /> Klar idag
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="30 dagars trend"
                      onClick={() => setTrendPoint(p)}
                    >
                      <LineChartIcon className="h-4 w-4" />
                    </Button>
                    {isBool ? (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-9 text-xs" onClick={() => saveMeasurement(p, true)}>
                          Godkänd
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs"
                          onClick={() => saveMeasurement(p, false)}
                        >
                          Ej godkänd
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Input
                          value={values[p.id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveMeasurement(p);
                          }}
                          inputMode="decimal"
                          placeholder={p.unit}
                          className="h-11 w-24 text-center font-mono text-base tabular-nums"
                        />
                        <Button size="sm" className="h-11 px-4 text-sm" onClick={() => saveMeasurement(p)}>
                          Spara
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="deviations" className="mt-3 space-y-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setDevForm({ source: "övrigt", description: "" })}
            >
              <Plus className="h-3.5 w-3.5" /> Ny avvikelse
            </Button>
          </div>
          {openDeviations.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Inga öppna avvikelser"
              description="Avvikelser skapas automatiskt när en mätning ligger utanför gränsvärdet, och kan även läggas upp manuellt vid klagomål eller myndighetsbesök."
            />
          ) : (
            openDeviations.map((d) => {
              const overdue = d.due_date && (daysUntil(d.due_date) ?? 0) < 0;
              return (
                <button
                  key={d.id}
                  onClick={() => setDevForm({ ...d })}
                  className={`flex w-full items-start gap-2 rounded-md border p-2 text-left hover:bg-accent/40 ${
                    overdue ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 ${overdue ? "text-destructive" : "text-amber-500"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.title || d.description}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{d.description}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {d.source} · uppkom {dateFmt(d.created_at)}
                      {d.due_date ? ` · åtgärdas ${d.due_date}` : ""}
                      {!d.root_cause ? " · rotorsak saknas" : ""}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="due" className="mt-3 space-y-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setReqForm({ interval_months: 12, title: "" })}
            >
              <Plus className="h-3.5 w-3.5" /> Nytt krav
            </Button>
          </div>
          {requirements.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-4 w-4" />}
              title="Inga lagkrav upplagda"
              description="Lägg upp kalibrering, vågverifiering, köldmediakontroll och hygienutbildning så bevakas förfallodatumen 60, 30 och 7 dagar i förväg."
            />
          ) : (
            requirements.map((r) => {
              const status = requirementStatus(r.next_due);
              const d = daysUntil(r.next_due);
              return (
                <button
                  key={r.id}
                  onClick={() => setReqForm({ ...r })}
                  className={`flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-accent/40 ${
                    status === "forfallen"
                      ? "border-destructive/50 bg-destructive/5"
                      : status === "snart"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border bg-card"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[r.regulation, `var ${r.interval_months} mån`, r.responsible].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs tabular-nums text-foreground">{r.next_due ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d === null
                        ? "datum saknas"
                        : d < 0
                          ? `${Math.abs(d)} dagar sent`
                          : `${d} dagar kvar`}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="chilling" className="mt-3">
          <ChillingPanel />
        </TabsContent>

        <TabsContent value="instruments" className="mt-3 space-y-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setInstForm({ instrument_type: "termometer", calibration_interval_months: 12 })}
            >
              <Plus className="h-3.5 w-3.5" /> Nytt instrument
            </Button>
          </div>
          {instruments.length === 0 ? (
            <EmptyState
              icon={<Ruler className="h-4 w-4" />}
              title="Inga instrument registrerade"
              description="Registrera termometrar och vågar med serienummer och kalibreringsintervall, så följer kalibreringarna med i bevakningen."
            />
          ) : (
            instruments.map((i) => (
              <button
                key={i.id}
                onClick={() => setInstForm({ ...i })}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-card p-2 text-left hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[i.instrument_type, i.serial_number, i.placement].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {i.next_calibration ?? "—"}
                </p>
              </button>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Trendvy, 30 dagar */}
      <TrendDialog point={trendPoint} onClose={() => setTrendPoint(null)} />

      {/* Kontrollpunkt */}
      <Dialog open={!!pointForm} onOpenChange={(o) => !o && setPointForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              {pointForm?.id ? "Redigera kontrollpunkt" : "Ny kontrollpunkt"}
            </DialogTitle>
          </DialogHeader>
          {pointForm && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Namn</Label>
                <Input
                  value={pointForm.name ?? ""}
                  onChange={(e) => setPointForm({ ...pointForm, name: e.target.value })}
                  placeholder="Kylrum 1, temperatur"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kategori</Label>
                <Select
                  value={pointForm.category ?? "temperatur"}
                  onValueChange={(v) => setPointForm({ ...pointForm, category: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frekvens</Label>
                <Select
                  value={pointForm.frequency ?? "dagligen"}
                  onValueChange={(v) => setPointForm({ ...pointForm, frequency: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Enhet</Label>
                <Select
                  value={pointForm.unit ?? "grader C"}
                  onValueChange={(v) => setPointForm({ ...pointForm, unit: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["grader C", "dagar", "ja/nej", "resultat"].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zon (1–4)</Label>
                <Input
                  value={pointForm.zone ?? ""}
                  onChange={(e) =>
                    setPointForm({ ...pointForm, zone: e.target.value ? Number(e.target.value) : null })
                  }
                  inputMode="numeric"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gräns min</Label>
                <Input
                  value={pointForm.limit_min ?? ""}
                  onChange={(e) =>
                    setPointForm({
                      ...pointForm,
                      limit_min: e.target.value ? Number(e.target.value.replace(",", ".")) : null,
                    })
                  }
                  inputMode="decimal"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Gräns max</Label>
                <Input
                  value={pointForm.limit_max ?? ""}
                  onChange={(e) =>
                    setPointForm({
                      ...pointForm,
                      limit_max: e.target.value ? Number(e.target.value.replace(",", ".")) : null,
                    })
                  }
                  inputMode="decimal"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Ansvarig roll</Label>
                <Input
                  value={pointForm.responsible_role ?? ""}
                  onChange={(e) => setPointForm({ ...pointForm, responsible_role: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              className="gap-1 text-xs"
              disabled={savePoint.isPending}
              onClick={async () => {
                if (!pointForm?.name?.trim()) {
                  toast.error("Kontrollpunkten behöver ett namn.");
                  return;
                }
                try {
                  await savePoint.mutateAsync(pointForm);
                  toast.success("Kontrollpunkten är sparad.");
                  setPointForm(null);
                } catch (e: any) {
                  toast.error(e.message || "Kontrollpunkten kunde inte sparas.");
                }
              }}
            >
              <Save className="h-3.5 w-3.5" /> Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Avvikelse */}
      <Dialog open={!!devForm} onOpenChange={(o) => !o && setDevForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {devForm?.id ? "Avvikelse" : "Ny avvikelse"}
            </DialogTitle>
          </DialogHeader>
          {devForm && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Beskrivning</Label>
                <Textarea
                  value={devForm.description ?? ""}
                  onChange={(e) => setDevForm({ ...devForm, description: e.target.value })}
                  className="min-h-16 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Omedelbar åtgärd</Label>
                <Input
                  value={devForm.immediate_action ?? ""}
                  onChange={(e) => setDevForm({ ...devForm, immediate_action: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rotorsak (krävs för att stänga)</Label>
                <Input
                  value={devForm.root_cause ?? ""}
                  onChange={(e) => setDevForm({ ...devForm, root_cause: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Korrigerande åtgärd</Label>
                <Input
                  value={devForm.corrective_action ?? ""}
                  onChange={(e) => setDevForm({ ...devForm, corrective_action: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Ansvarig</Label>
                  <Input
                    value={devForm.responsible ?? ""}
                    onChange={(e) => setDevForm({ ...devForm, responsible: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Åtgärdas senast</Label>
                  <Input
                    type="date"
                    value={devForm.due_date ?? ""}
                    onChange={(e) => setDevForm({ ...devForm, due_date: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Verifiering att åtgärden fungerade (krävs för att stänga)</Label>
                <Input
                  value={devForm.verification ?? ""}
                  onChange={(e) => setDevForm({ ...devForm, verification: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              {devForm.closed_at && (
                <p className="text-[11px] text-muted-foreground">
                  Stängd {dateFmt(devForm.closed_at)}.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={doSaveDeviation}>
              Spara
            </Button>
            {devForm && !devForm.closed_at && (
              <Button
                size="sm"
                className="text-xs"
                onClick={() => {
                  setDevForm({ ...devForm, close: true });
                  setTimeout(doSaveDeviation, 0);
                }}
              >
                Stäng avvikelsen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lagkrav */}
      <Dialog open={!!reqForm} onOpenChange={(o) => !o && setReqForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{reqForm?.id ? "Lagkrav" : "Nytt lagkrav"}</DialogTitle>
          </DialogHeader>
          {reqForm && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Titel</Label>
                <Input
                  value={reqForm.title ?? ""}
                  onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Förordning eller standard</Label>
                <Input
                  value={reqForm.regulation ?? ""}
                  onChange={(e) => setReqForm({ ...reqForm, regulation: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Intervall (månader)</Label>
                  <Input
                    value={reqForm.interval_months ?? 12}
                    onChange={(e) =>
                      setReqForm({ ...reqForm, interval_months: Number(e.target.value) || 12 })
                    }
                    inputMode="numeric"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Senast utfört</Label>
                  <Input
                    type="date"
                    value={reqForm.last_done ?? ""}
                    onChange={(e) => setReqForm({ ...reqForm, last_done: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ansvarig</Label>
                <Input
                  value={reqForm.responsible ?? ""}
                  onChange={(e) => setReqForm({ ...reqForm, responsible: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={async () => {
                if (!reqForm?.title?.trim()) {
                  toast.error("Kravet behöver en titel.");
                  return;
                }
                try {
                  await saveRequirement.mutateAsync(reqForm);
                  toast.success("Kravet är sparat.");
                  setReqForm(null);
                } catch (e: any) {
                  toast.error(e.message || "Kravet kunde inte sparas.");
                }
              }}
            >
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instrument */}
      <Dialog open={!!instForm} onOpenChange={(o) => !o && setInstForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{instForm?.id ? "Instrument" : "Nytt instrument"}</DialogTitle>
          </DialogHeader>
          {instForm && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Namn</Label>
                <Input
                  value={instForm.name ?? ""}
                  onChange={(e) => setInstForm({ ...instForm, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Typ</Label>
                  <Select
                    value={instForm.instrument_type ?? "termometer"}
                    onValueChange={(v) => setInstForm({ ...instForm, instrument_type: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["termometer", "våg", "övrigt"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Serienummer</Label>
                  <Input
                    value={instForm.serial_number ?? ""}
                    onChange={(e) => setInstForm({ ...instForm, serial_number: e.target.value })}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Placering</Label>
                  <Input
                    value={instForm.placement ?? ""}
                    onChange={(e) => setInstForm({ ...instForm, placement: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kalibrering var (mån)</Label>
                  <Input
                    value={instForm.calibration_interval_months ?? 12}
                    onChange={(e) =>
                      setInstForm({
                        ...instForm,
                        calibration_interval_months: Number(e.target.value) || 12,
                      })
                    }
                    inputMode="numeric"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Senast kalibrerad</Label>
                  <Input
                    type="date"
                    value={instForm.last_calibrated ?? ""}
                    onChange={(e) => setInstForm({ ...instForm, last_calibrated: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch
                    checked={instForm.active ?? true}
                    onCheckedChange={(v) => setInstForm({ ...instForm, active: v })}
                  />
                  <span className="text-xs text-muted-foreground">Aktiv</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={async () => {
                if (!instForm?.name?.trim()) {
                  toast.error("Instrumentet behöver ett namn.");
                  return;
                }
                try {
                  await saveInstrument.mutateAsync(instForm);
                  toast.success("Instrumentet är sparat.");
                  setInstForm(null);
                } catch (e: any) {
                  toast.error(e.message || "Instrumentet kunde inte sparas.");
                }
              }}
            >
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrendDialog({ point, onClose }: { point: ControlPoint | null; onClose: () => void }) {
  const { data: records = [] } = useControlTrend(point?.id ?? null);
  const series = records
    .filter((r) => r.value_numeric !== null)
    .map((r) => ({
      date: new Date(r.measured_at).toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" }),
      value: Number(r.value_numeric),
    }));

  return (
    <Dialog open={!!point} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{point?.name} — senaste 30 dagarna</DialogTitle>
        </DialogHeader>
        {series.length === 0 ? (
          <p className="text-xs text-muted-foreground">Inga mätvärden ännu i perioden.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip />
                {point?.limit_max !== null && point?.limit_max !== undefined && (
                  <ReferenceLine y={point.limit_max} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                )}
                {point?.limit_min !== null && point?.limit_min !== undefined && (
                  <ReferenceLine y={point.limit_min} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
