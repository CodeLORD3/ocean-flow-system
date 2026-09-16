import { STATUS_COLOR, type MapStatus } from "@/lib/mapStatus";

/** Liten framstegsring — samma visuella språk som resten av systemets badges. */
export function StatusRing({
  percent,
  status,
  size = 34,
  label,
}: {
  percent: number;
  status: MapStatus;
  size?: number;
  label?: string;
}) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const color = STATUS_COLOR[status];
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, percent / 100)))}
        />
      </svg>
      <span className="absolute text-[9px] font-semibold tabular-nums" style={{ color }}>
        {label ?? `${percent}`}
      </span>
    </span>
  );
}
