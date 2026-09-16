import type { FloorPlan, MapObject, MapZone } from "@/hooks/useStoreMap";

/**
 * Skalan räknas fram ur de ytor någon har matat in i kvadratmeter.
 * En ruta som är 200x150 bildpunkter och 12 m² ger bildpunkter per meter.
 * Finns flera inmatade ytor används medelvärdet, vilket gör kartan stabil
 * även om en enskild uppgift är lite avrundad.
 */
export function derivePxPerMeter(
  plan: Pick<FloorPlan, "px_per_meter">,
  zones: Pick<MapZone, "width" | "height" | "area_sqm">[],
  objects: Pick<MapObject, "width" | "height" | "area_sqm">[],
): number | null {
  const samples: number[] = [];
  [...zones, ...objects].forEach((b) => {
    const area = Number(b.area_sqm);
    if (!area || area <= 0) return;
    const pxArea = b.width * b.height;
    if (pxArea <= 0) return;
    samples.push(Math.sqrt(pxArea / area));
  });
  if (samples.length > 0) return samples.reduce((a, b) => a + b, 0) / samples.length;
  const manual = Number(plan.px_per_meter);
  return manual && manual > 0 ? manual : null;
}

/** Uppskattad yta för en ruta som saknar inmatad kvadratmeter. */
export function estimateSqm(width: number, height: number, pxPerMeter: number | null): number | null {
  if (!pxPerMeter || pxPerMeter <= 0) return null;
  return (width * height) / (pxPerMeter * pxPerMeter);
}

/** Yta i m²: inmatad om den finns, annars uppskattad ur skalan. */
export function areaOf(
  box: { width: number; height: number; area_sqm: number | null },
  pxPerMeter: number | null,
): { sqm: number | null; exact: boolean } {
  const entered = Number(box.area_sqm);
  if (entered && entered > 0) return { sqm: entered, exact: true };
  return { sqm: estimateSqm(box.width, box.height, pxPerMeter), exact: false };
}

export const formatSqm = (sqm: number | null) =>
  sqm == null ? "—" : `${sqm.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} m²`;
