import type { MapZone } from "@/hooks/useStoreMap";

export type Pt = { x: number; y: number };

/**
 * Zonens geometri är en polygon. Saknar zonen ritade punkter används
 * rektangeln som fallback, så äldre zoner fortsätter fungera oförändrat.
 */
export function zonePoints(zone: Pick<MapZone, "x" | "y" | "width" | "height" | "points">): Pt[] {
  const raw = zone.points as unknown;
  if (Array.isArray(raw) && raw.length >= 3) {
    const pts = raw
      .map((p) => {
        const o = p as { x?: number; y?: number };
        return { x: Number(o?.x), y: Number(o?.y) };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length >= 3) return pts;
  }
  const { x, y, width, height } = zone;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export const toPath = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

/** Ytterlådan runt en polygon — används för normaliserade bildkoordinater. */
export function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Tyngdpunkten, där zonens namn och nummer placeras. */
export function centroid(pts: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const b = bbox(pts);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Polygonens yta i bildpunkter (skoformeln). */
export function polygonPxArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon(pt: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Flyttar hela polygonen. */
export const translatePoints = (pts: Pt[], dx: number, dy: number) =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/** Bildpunkt → normaliserad plats (0–1) inom zonens ytterlåda. */
export function toNormalized(pt: Pt, pts: Pt[]) {
  const b = bbox(pts);
  return {
    x: b.width > 0 ? (pt.x - b.x) / b.width : 0,
    y: b.height > 0 ? (pt.y - b.y) / b.height : 0,
  };
}

/** Normaliserad plats (0–1) → bildpunkt. Oberoende av zoom och rutnätsstorlek. */
export function fromNormalized(norm: Pt, pts: Pt[]): Pt {
  const b = bbox(pts);
  return { x: b.x + norm.x * b.width, y: b.y + norm.y * b.height };
}
