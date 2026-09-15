import { useMemo, useState } from "react";
import { movementLabel } from "@/hooks/useStockMovements";
import { gapBetween, sinceNow, stampSv } from "@/lib/dwell";

export interface ChainMovement {
  id: string;
  movement_type: string;
  quantity_kg: number | string;
  created_at: string;
  note?: string | null;
  reference_id?: string | null;
  storage_locations?: { name?: string | null } | null;
  staff?: { first_name?: string | null; last_name?: string | null } | null;
}

interface Props {
  /** Rörelser i tidsordning för det valda partiet. */
  movements: ChainMovement[];
  lotNumber?: string | null;
  productName?: string | null;
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

const namnPa = (m: ChainMovement) =>
  m.staff ? `${m.staff.first_name ?? ""} ${m.staff.last_name ?? ""}`.trim() || "System" : "System";

/**
 * Visuell transaktionskedja för ett parti: varje händelse är en nod på en
 * tidsaxel, uttag grenar av åt sidan, och tiden mellan noderna står på linjen.
 * Klick på en nod visar all information om händelsen.
 */
export default function LotChainGraph({ movements, lotNumber, productName }: Props) {
  const [valdId, setValdId] = useState<string | null>(null);

  const noder = useMemo(() => {
    let saldo = 0;
    return movements.map((m, i) => {
      const kg = Number(m.quantity_kg || 0);
      saldo += kg;
      return {
        m,
        kg,
        saldo,
        gren: kg < 0,
        gap: i === 0 ? "" : gapBetween(movements[i - 1].created_at, m.created_at),
      };
    });
  }, [movements]);

  const vald = noder.find((n) => n.m.id === valdId) ?? noder[noder.length - 1] ?? null;

  if (!movements.length)
    return <p className="py-4 text-xs text-muted-foreground">Inga rörelser kopplade till partiet ännu.</p>;

  const STEG = 68;
  const X = 40;
  const GREN = 150;
  const height = noder.length * STEG + 96;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-x-auto overflow-y-auto">
        <svg width={340} height={height} className="min-w-[340px]">
          {/* Rotnod: inleverans av partiet */}
          <text x={X - 24} y={20} className="fill-muted-foreground text-[10px]">
            Start
          </text>

          {noder.map((n, i) => {
            const y = 40 + i * STEG;
            const forraY = 40 + (i - 1) * STEG;
            const nx = n.gren ? X + GREN : X;
            return (
              <g key={n.m.id}>
                {/* Linje från föregående nod på stammen */}
                {i > 0 && <line x1={X} y1={forraY} x2={X} y2={y} stroke="currentColor" className="text-border" />}
                {n.gren && (
                  <line x1={X} y1={y} x2={nx} y2={y} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
                )}
                {/* Tid mellan händelser */}
                {i > 0 && n.gap && (
                  <text x={X + 6} y={(forraY + y) / 2 + 3} className="fill-muted-foreground text-[10px]">
                    {n.gap}
                  </text>
                )}
                {/* Noden */}
                <circle
                  cx={nx}
                  cy={y}
                  r={n.m.id === vald?.m.id ? 7 : 5}
                  className={
                    n.kg < 0
                      ? "cursor-pointer fill-destructive"
                      : "cursor-pointer fill-foreground"
                  }
                  onClick={() => setValdId(n.m.id)}
                />
                <text
                  x={nx + 12}
                  y={y - 2}
                  className="cursor-pointer fill-foreground text-[11px] font-medium"
                  onClick={() => setValdId(n.m.id)}
                >
                  {movementLabel(n.m.movement_type)}
                </text>
                <text x={nx + 12} y={y + 11} className="fill-muted-foreground text-[10px]">
                  {stampSv(n.m.created_at)} · {n.kg > 0 ? "+" : ""}
                  {nf(n.kg, 1)} kg
                </text>
              </g>
            );
          })}

          {/* Nuvarande läge */}
          <line
            x1={X}
            y1={40 + (noder.length - 1) * STEG}
            x2={X}
            y2={40 + noder.length * STEG}
            stroke="currentColor"
            className="text-border"
          />
          <circle cx={X} cy={40 + noder.length * STEG} r={5} className="fill-primary" />
          <text x={X + 12} y={40 + noder.length * STEG + 4} className="fill-foreground text-[11px] font-semibold">
            Nu · {nf(noder[noder.length - 1].saldo, 1)} kg
          </text>
          <text x={X + 12} y={40 + noder.length * STEG + 17} className="fill-muted-foreground text-[10px]">
            senaste händelsen {sinceNow(noder[noder.length - 1].m.created_at)} sedan
          </text>
        </svg>
      </div>

      {/* All info om vald nod */}
      {vald && (
        <div className="h-fit rounded-md border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">All info</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{movementLabel(vald.m.movement_type)}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {[
              ["Produkt", productName || "—"],
              ["Parti", lotNumber || "—"],
              ["Datum och tid", stampSv(vald.m.created_at)],
              ["Förändring", `${vald.kg > 0 ? "+" : ""}${nf(vald.kg, 1)} kg`],
              ["Saldo efter", `${nf(vald.saldo, 1)} kg`],
              ["Plats", vald.m.storage_locations?.name || "—"],
              ["Av", namnPa(vald.m)],
              ["Låg orörd innan", vald.gap || "Första händelsen"],
              ["Referens", vald.m.reference_id || "—"],
              ["Notering", vald.m.note || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
