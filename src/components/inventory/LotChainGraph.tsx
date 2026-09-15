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
  /** Inköpspris per kilo, för värdet på varje händelse. */
  unitCost?: number | null;
  currency?: string;
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

const namnPa = (m: ChainMovement) =>
  m.staff ? `${m.staff.first_name ?? ""} ${m.staff.last_name ?? ""}`.trim() || "System" : "System";

const DX = 58;
const DY = 70;
const X0 = 34;
const Y0 = 34;
const GREN_DX = 52;
const GREN_DY = 34;

/**
 * Visuell transaktionskedja enligt skissen: en diagonal kedja av händelser
 * där tiden mellan dem står på linjen, uttag grenar av snett nedåt, och
 * kedjan slutar i en "Live"-nod med aktuellt saldo. Klick på en nod öppnar
 * "All info"-rutan.
 */
export default function LotChainGraph({
  movements,
  lotNumber,
  productName,
  unitCost = null,
  currency = "SEK",
}: Props) {
  const [valdId, setValdId] = useState<string | null>(null);

  const noder = useMemo(() => {
    let saldo = 0;
    let stam = 0;
    return movements.map((m, i) => {
      const kg = Number(m.quantity_kg || 0);
      saldo += kg;
      const gren = kg < 0;
      const punkt = { x: X0 + stam * DX, y: Y0 + stam * DY };
      if (!gren) stam += 1;
      return {
        m,
        kg,
        saldo,
        gren,
        x: gren ? punkt.x + GREN_DX : punkt.x,
        y: gren ? punkt.y + GREN_DY : punkt.y,
        stamX: punkt.x,
        stamY: punkt.y,
        gap: i === 0 ? "" : gapBetween(movements[i - 1].created_at, m.created_at),
      };
    });
  }, [movements]);

  const vald = noder.find((n) => n.m.id === valdId) ?? noder[noder.length - 1] ?? null;

  if (!movements.length)
    return <p className="py-4 text-xs text-muted-foreground">Inga rörelser kopplade till partiet ännu.</p>;

  const stamNoder = noder.filter((n) => !n.gren);
  const sista = stamNoder[stamNoder.length - 1] ?? noder[0];
  const liveX = sista.stamX + DX;
  const liveY = sista.stamY + DY;
  const width = Math.max(liveX + 150, 420);
  const height = liveY + 60;
  const slutSaldo = noder[noder.length - 1].saldo;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
      <div className="overflow-auto rounded-md border border-border bg-background p-2">
        <svg width={width} height={height} style={{ minWidth: width }}>
          {noder.map((n, i) => {
            const forra = i > 0 ? noder[i - 1] : null;
            const fran = n.gren ? { x: n.stamX, y: n.stamY } : forra ? { x: forra.stamX, y: forra.stamY } : null;
            const visaLinje = n.gren || i > 0;
            const mitt = fran ? { x: (fran.x + n.x) / 2, y: (fran.y + n.y) / 2 } : null;
            const aktiv = n.m.id === vald?.m.id;
            return (
              <g key={n.m.id}>
                {visaLinje && fran && (
                  <line
                    x1={fran.x}
                    y1={fran.y}
                    x2={n.x}
                    y2={n.y}
                    stroke="currentColor"
                    className={n.gren ? "text-rose-500/60" : "text-emerald-600/50"}
                    strokeWidth={n.gren ? 1 : 1.5}
                  />
                )}
                {mitt && n.gap && (
                  <text
                    x={mitt.x + 8}
                    y={mitt.y - 4}
                    className="fill-muted-foreground text-[10px]"
                  >
                    {n.gap}
                  </text>
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={aktiv ? 8 : 5.5}
                  className={n.kg < 0 ? "cursor-pointer fill-rose-500" : "cursor-pointer fill-emerald-600"}
                  onClick={() => setValdId(n.m.id)}
                />
                {aktiv && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={12}
                    fill="none"
                    stroke="currentColor"
                    className="text-foreground/30"
                  />
                )}
                <text
                  x={n.x + 14}
                  y={n.y + 2}
                  className="cursor-pointer fill-foreground text-[11px] font-medium"
                  onClick={() => setValdId(n.m.id)}
                >
                  {movementLabel(n.m.movement_type)}
                </text>
                <text x={n.x + 14} y={n.y + 15} className="fill-muted-foreground text-[10px]">
                  {stampSv(n.m.created_at)} · {n.kg > 0 ? "+" : ""}
                  {nf(n.kg, 1)} kg
                  {unitCost != null ? ` · ${nf(Math.abs(n.kg) * unitCost, 0)} ${currency}` : ""}
                </text>
              </g>
            );
          })}

          {/* Live-nod: aktuellt läge */}
          <line
            x1={sista.stamX}
            y1={sista.stamY}
            x2={liveX}
            y2={liveY}
            stroke="currentColor"
            className="text-foreground/40"
            strokeWidth={1.5}
          />
          <circle cx={liveX} cy={liveY} r={7} className="fill-primary" />
          <text x={liveX + 14} y={liveY - 2} className="fill-foreground text-[11px] font-semibold">
            Live · {nf(slutSaldo, 1)} kg
          </text>
          <text x={liveX + 14} y={liveY + 12} className="fill-muted-foreground text-[10px]">
            senaste händelsen {sinceNow(noder[noder.length - 1].m.created_at)} sedan
          </text>
        </svg>
      </div>

      {/* All info om vald nod */}
      {vald && (
        <div className="h-fit rounded-md border border-foreground/30 bg-background p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">All info</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{movementLabel(vald.m.movement_type)}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {[
              ["Produkt", productName || "—"],
              ["Parti", lotNumber || "—"],
              ["Datum och tid", stampSv(vald.m.created_at)],
              ["Förändring", `${vald.kg > 0 ? "+" : ""}${nf(vald.kg, 1)} kg`],
              ["Saldo efter", `${nf(vald.saldo, 1)} kg`],
              ...(unitCost != null
                ? ([
                    ["Värde på händelsen", `${nf(Math.abs(vald.kg) * unitCost, 0)} ${currency}`],
                    ["Värde kvar", `${nf(vald.saldo * unitCost, 0)} ${currency}`],
                  ] as [string, string][])
                : []),
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
