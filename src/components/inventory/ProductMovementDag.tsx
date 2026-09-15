import { useMemo, useState } from "react";

const nf = (n: number, d = 1) =>
  Number(n)
    .toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/\u00a0/g, " ");

const dateSv = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" });
const timeSv = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
const stampSv = (iso: string) => `${dateSv(iso)} ${timeSv(iso)}`;

export type DagEvent = {
  id: string;
  created_at: string;
  qty: number;
  type: string;
  label: string;
  location: string;
  who: string;
  reference: string | null;
  note: string | null;
};

export type DagBranch = { key: string; label: string; lotId: string | null; events: DagEvent[] };

/** Färgklass per rörelsetyp — semantiska tokens, currentColor i SVG. */
const toneFor = (type: string, qty: number) => {
  if (type.includes("svinn") || type.includes("kassation")) return "text-destructive";
  if (type.includes("invent")) return "text-primary";
  if (type.includes("transfer") || type.includes("overforing") || type.includes("transport"))
    return "text-muted-foreground";
  return qty >= 0 ? "text-success" : "text-foreground";
};

const LANE_H = 74;
const COL_W = 150;
const PAD_X = 118;
const PAD_Y = 40;

/**
 * Visuellt transaktionsträd (DAG) för en produkt: produkten som rot, ett spår
 * per parti, noder i tidsordning med mängd, tidpunkt och vem som gjorde det.
 */
export default function ProductMovementDag({
  productName,
  branches,
  onTraceLot,
}: {
  productName: string;
  branches: DagBranch[];
  onTraceLot?: (lotId: string, label: string) => void;
}) {
  const [active, setActive] = useState<DagEvent | null>(null);

  const lanes = useMemo(
    () =>
      branches.map((b) => ({
        ...b,
        events: [...b.events].sort((a, c) => (a.created_at < c.created_at ? -1 : 1)),
      })),
    [branches],
  );

  const maxCols = Math.max(1, ...lanes.map((l) => l.events.length));
  const width = PAD_X + maxCols * COL_W + 40;
  const height = PAD_Y * 2 + Math.max(1, lanes.length) * LANE_H;
  const rootY = PAD_Y + (Math.max(1, lanes.length) * LANE_H) / 2;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-gradient-to-b from-muted/30 to-background">
        <svg width={width} height={height} className="block">
          {/* Rotnod: produkten */}
          <g>
            <rect
              x={8}
              y={rootY - 18}
              width={96}
              height={36}
              rx={8}
              className="fill-primary/15 stroke-primary/60"
              strokeWidth={1}
            />
            <text x={56} y={rootY + 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
              {productName.length > 13 ? `${productName.slice(0, 12)}…` : productName}
            </text>
          </g>

          {lanes.map((lane, li) => {
            const y = PAD_Y + li * LANE_H + LANE_H / 2;
            let running = 0;
            return (
              <g key={lane.key}>
                {/* Gren från roten till spåret */}
                <path
                  d={`M104 ${rootY} C ${(104 + PAD_X) / 2} ${rootY}, ${(104 + PAD_X) / 2} ${y}, ${PAD_X - 10} ${y}`}
                  className="stroke-border"
                  strokeWidth={1.5}
                  fill="none"
                />
                <text x={PAD_X - 14} y={y - 14} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {lane.label.length > 14 ? `${lane.label.slice(0, 13)}…` : lane.label}
                </text>

                {lane.events.map((e, i) => {
                  running += e.qty;
                  const x = PAD_X + i * COL_W;
                  const tone = toneFor(e.type, e.qty);
                  const isActive = active?.id === e.id;
                  return (
                    <g key={e.id} className="cursor-pointer" onClick={() => setActive(isActive ? null : e)}>
                      {i > 0 && (
                        <line
                          x1={x - COL_W + 11}
                          y1={y}
                          x2={x - 11}
                          y2={y}
                          className="stroke-border"
                          strokeWidth={1.5}
                          markerEnd="url(#dag-arrow)"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive ? 10 : 7}
                        className={`${tone} fill-current`}
                        opacity={0.9}
                      />
                      <circle cx={x} cy={y} r={12} className={`${tone} stroke-current`} strokeWidth={1} fill="none" opacity={isActive ? 0.9 : 0.25} />
                      <text x={x} y={y - 20} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
                        {e.label.length > 16 ? `${e.label.slice(0, 15)}…` : e.label}
                      </text>
                      <text x={x} y={y + 24} textAnchor="middle" className={`${tone} fill-current text-[10px] font-mono`}>
                        {e.qty >= 0 ? "+" : "−"}
                        {nf(Math.abs(e.qty))} · {nf(running)}
                      </text>
                      <text x={x} y={y + 35} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                        {stampSv(e.created_at)}
                      </text>
                      <text x={x} y={y + 45} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                        {(e.who || "System").length > 18 ? `${(e.who || "System").slice(0, 17)}…` : e.who || "System"}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          <defs>
            <marker id="dag-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" className="fill-border" />
            </marker>
          </defs>
        </svg>
      </div>

      {active && (
        <div className="rounded-md border border-border bg-card p-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold text-foreground">{active.label}</span>
            <span className={`font-mono tabular-nums ${active.qty < 0 ? "text-destructive" : "text-success"}`}>
              {active.qty >= 0 ? "+" : "−"}
              {nf(Math.abs(active.qty))} kg
            </span>
            <span className="text-muted-foreground">{stampSv(active.created_at)}</span>
            <span className="text-muted-foreground">{active.who || "System"}</span>
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {[active.location, active.reference, active.note].filter(Boolean).join(" · ") || "Ingen extra information"}
          </div>
        </div>
      )}

      {onTraceLot && lanes.some((l) => l.lotId) && (
        <div className="flex flex-wrap gap-1">
          {lanes
            .filter((l) => l.lotId)
            .map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => onTraceLot(l.lotId!, l.label)}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Kedja för {l.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
