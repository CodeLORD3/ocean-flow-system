import {
  BOUNDARIES,
  COMPARISON_ROWS,
  DESIGN_FROM_ERP,
  DESIGN_OURS,
  FLOW_STEPS,
  OPEN_GAPS,
  STATUS_EDGE,
  STATUS_LABELS,
  STATUS_ROW_TONE,
  SUMMARY_POINTS,
  type ComparisonStatus,
} from "@/lib/systemComparison";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, Check, GitCompare, Minus } from "lucide-react";

const STATUS_ICON: Record<ComparisonStatus, typeof Check> = {
  starkt: Check,
  likvardigt: Minus,
  saknas: AlertTriangle,
};

function StatusChip({ status }: { status: ComparisonStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
      <Icon className="h-3 w-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-xs leading-relaxed">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{children}</h2>
  );
}

export default function AboutComparison() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GitCompare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Om systemet · Jämförelse</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Hur Makrill Trade står sig mot generella affärssystem (Pyramid, Vitec, Monitor) och
        fiskspecifika system (Wisefish, inecta, Loop ERP). Underlag för sälj, introduktion och
        prioritering.
      </p>

      {/* Sammanfattning */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Sammanfattning</SectionTitle>
          <Bullets items={SUMMARY_POINTS} />
        </CardContent>
      </Card>

      {/* Utgångspunkt + flöde */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Utgångspunkten</SectionTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ett generellt affärssystem sätter huvudboken i mitten — lager och order finns där för att
            bokföringen ska stämma, och branschbehov löses med tilläggsmoduler. Vårt system sätter
            varan i mitten: ett parti kommer in, vägs, styckas, flyttas mellan lagernivåer,
            prissätts per kanal och säljs över disk eller till butik.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FLOW_STEPS.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span className="rounded border border-border bg-muted px-2 py-1 text-[11px] font-medium">
                  {step}
                </span>
                {i < FLOW_STEPS.length - 1 && (
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Funktionsjämförelse */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Funktionsjämförelse</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {(["starkt", "likvardigt", "saknas"] as ComparisonStatus[]).map((s) => (
                <span key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_EDGE[s]}`} />
                  {STATUS_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          {/* Desktop: fast kolumnraster så texten står i lodräta linjer */}
          <div className="hidden overflow-hidden rounded-md border border-border md:block">
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-3 border-b border-border bg-muted px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Område</span>
              <span>Makrill Trade</span>
              <span>Pyramid / Vitec</span>
              <span>Wisefish / inecta / Loop</span>
            </div>
            <div className="divide-y divide-border">
              {COMPARISON_ROWS.map((r) => (
                <div
                  key={r.area}
                  className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] items-start gap-x-3 px-3 py-2 text-xs ${STATUS_ROW_TONE[r.status]}`}
                >
                  <span className="font-semibold">{r.area}</span>
                  <span>{r.ours}</span>
                  <span className="text-foreground/80">{r.general}</span>
                  <span className="text-foreground/80">{r.fishSpecific}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobil: samma data som kort */}
          <div className="space-y-2 md:hidden">
            {COMPARISON_ROWS.map((r) => (
              <div
                key={r.area}
                className={`overflow-hidden rounded-md border border-border ${STATUS_ROW_TONE[r.status]}`}
              >
                <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
                  <span className={`h-4 w-1 shrink-0 rounded-sm ${STATUS_EDGE[r.status]}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.area}</span>
                  <StatusChip status={r.status} />
                </div>
                <dl className="space-y-1 px-2.5 py-2 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Vi</dt>
                    <dd className="min-w-0 font-medium">{r.ours}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Generella</dt>
                    <dd className="min-w-0">{r.general}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Fiskspecifika</dt>
                    <dd className="min-w-0">{r.fishSpecific}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Avgränsningar */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Medvetna avgränsningar</SectionTitle>
          <Bullets items={BOUNDARIES} />
        </CardContent>
      </Card>

      {/* Design */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionTitle>Från ERP-traditionen</SectionTitle>
            <Bullets items={DESIGN_FROM_ERP} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionTitle>Eget för oss</SectionTitle>
            <Bullets items={DESIGN_OURS} />
          </CardContent>
        </Card>
      </div>

      {/* Öppna gap */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Öppna gap</SectionTitle>
          <p className="text-[11px] text-muted-foreground">
            Listat som gap, inte som löst.
          </p>
          <ul className="space-y-1.5">
            {OPEN_GAPS.map((g) => (
              <li
                key={g}
                className="flex items-start gap-2 rounded-md bg-row-warn px-2.5 py-1.5 text-xs"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        Källtext: docs/positioning.md — uppdatera src/lib/systemComparison.ts för att ändra denna
        vy.
      </p>
    </div>
  );
}
