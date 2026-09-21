import { centroid, zonePoints } from "@/lib/mapGeometry";
import type { MapZone } from "@/hooks/useStoreMap";
import type { ResolvedNeed } from "@/hooks/useResources";

/**
 * Arbetsvägen: var hämtar jag, var utför jag arbetet, var lämnar jag tillbaka.
 *
 * Systemet räknar fram ett rimligt förslag — ingen ruttoptimering. Butiken kan
 * spara sin egen ordning som standardväg, och den vinner alltid över förslaget.
 * Platsen bor i resursregistret, aldrig i vägen.
 */

export type StopPurpose = "hamta" | "utfor" | "kontrollera" | "tillbaka";

export const PURPOSE_LABEL: Record<StopPurpose, string> = {
  hamta: "Hämta",
  utfor: "Utför",
  kontrollera: "Kontrollera",
  tillbaka: "Lämna tillbaka",
};

export type RouteStop = {
  /** Stabil nyckel så en sparad standardordning håller över tid. */
  key: string;
  purpose: StopPurpose;
  zoneId: string | null;
  zoneName: string | null;
  /** Exakt plats, t.ex. "Städstation · ST-01". */
  place: string | null;
  items: string[];
  /** Arbetstid på stoppet (utför/kontrollera), inte gångtid. */
  minutes?: number | null;
};

export type RouteLeg = { fromZoneId: string | null; toZoneId: string | null; meters: number | null; seconds: number | null; estimated: boolean };

export type WorkRoute = {
  stops: RouteStop[];
  legs: RouteLeg[];
  totalMeters: number | null;
  walkSeconds: number | null;
  /** Sant om någon etapp bara är uppskattad ur kartans skala. */
  estimated: boolean;
};

export type ZoneConnection = {
  from_zone_id: string;
  to_zone_id: string;
  walk_seconds: number | null;
  distance_meters: number | null;
  active: boolean;
};

export type StandardRoute = {
  id?: string;
  template_item_id?: string | null;
  store_id?: string | null;
  route_mode: "calculated" | "standard";
  stops: { key: string }[];
  version: number;
};

/** Gånghastighet i butik, meter per sekund. Medvetet lugn takt. */
const WALK_SPEED = 1.1;

const stopKey = (purpose: StopPurpose, zoneId: string | null, place: string | null) =>
  `${purpose}:${zoneId ?? "utan-omrade"}:${place ?? ""}`;

/** Hittar kopplingen mellan två områden, oavsett riktning. */
export function connectionBetween(connections: ZoneConnection[], a: string | null, b: string | null) {
  if (!a || !b || a === b) return null;
  return (
    connections.find(
      (c) =>
        c.active !== false &&
        ((c.from_zone_id === a && c.to_zone_id === b) || (c.from_zone_id === b && c.to_zone_id === a)),
    ) ?? null
  );
}

type ZoneLike = Pick<MapZone, "id" | "name" | "x" | "y" | "width" | "height" | "points">;

/** Etapp mellan två områden: inmatad koppling först, annars uppskattning ur kartans skala. */
export function legBetween(
  zones: ZoneLike[],
  connections: ZoneConnection[],
  fromZoneId: string | null,
  toZoneId: string | null,
  pxPerMeter: number | null,
): RouteLeg {
  const base = { fromZoneId, toZoneId };
  if (!fromZoneId || !toZoneId || fromZoneId === toZoneId) {
    return { ...base, meters: 0, seconds: 0, estimated: false };
  }
  const conn = connectionBetween(connections, fromZoneId, toZoneId);
  if (conn && (conn.walk_seconds != null || conn.distance_meters != null)) {
    const meters = conn.distance_meters != null ? Number(conn.distance_meters) : null;
    const seconds = conn.walk_seconds != null ? Number(conn.walk_seconds) : meters != null ? Math.round(meters / WALK_SPEED) : null;
    return { ...base, meters, seconds, estimated: false };
  }
  const a = zones.find((z) => z.id === fromZoneId);
  const b = zones.find((z) => z.id === toZoneId);
  if (!a || !b || !pxPerMeter || pxPerMeter <= 0) return { ...base, meters: null, seconds: null, estimated: true };
  const pa = centroid(zonePoints(a));
  const pb = centroid(zonePoints(b));
  const px = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  const meters = px / pxPerMeter;
  return { ...base, meters, seconds: Math.round(meters / WALK_SPEED), estimated: true };
}

export type BuildRouteInput = {
  /** Området där arbetet utförs. */
  area: { id: string; name: string } | null;
  taskName: string;
  needs: ResolvedNeed[];
  zones: ZoneLike[];
  connections: ZoneConnection[];
  pxPerMeter: number | null;
  /** Kontrollpunkter i Genomför — ger ett eget kontrollsteg i vägen. */
  checkpoints?: string[];
  minutes?: { do?: number | null; check?: number | null };
};

/**
 * Bygger förslaget: hämtstoppen grupperade per plats, arbetet i uppgiftens
 * område, kontrollen där arbetet gjordes och återlämning av de saker som ska
 * tillbaka. En sak som hör till en annan sak får aldrig ett eget stopp.
 */
export function buildRoute(input: BuildRouteInput): WorkRoute {
  const { area, taskName, needs, zones, connections, pxPerMeter, checkpoints = [], minutes } = input;
  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? null;

  const pickup = new Map<string, RouteStop>();
  const back = new Map<string, RouteStop>();

  // Bärarna först, så saker som ligger på dem kan läggas till samma stopp.
  const ordered = [...needs].sort((a, b) => Number(!!a.carriedBy) - Number(!!b.carriedBy));

  ordered.forEach((need) => {
    // Hör saken till en annan sak hämtas den samtidigt som bäraren.
    if (need.carriedBy) {
      const carrier = needs.find((n) => n.resource?.id === need.carriedBy);
      const key = stopKey("hamta", carrier?.zoneId ?? need.zoneId, carrier?.place ?? need.place);
      const stop = pickup.get(key);
      const label = need.resource?.name ?? need.requirement.requirement_name;
      if (stop) {
        if (!stop.items.includes(label)) stop.items.push(label);
        if (need.resource?.reusable !== false) {
          const bKey = stopKey("tillbaka", carrier?.zoneId ?? need.zoneId, carrier?.place ?? need.place);
          const b = back.get(bKey);
          if (b && !b.items.includes(label)) b.items.push(label);
        }
        return;
      }
    }
    const name = need.resource?.name ?? need.requirement.requirement_name;
    const key = stopKey("hamta", need.zoneId, need.place);
    const existing = pickup.get(key);
    if (existing) {
      if (!existing.items.includes(name)) existing.items.push(name);
    } else {
      pickup.set(key, {
        key,
        purpose: "hamta",
        zoneId: need.zoneId,
        zoneName: zoneName(need.zoneId),
        place: need.place,
        items: [name],
      });
    }
    // Återanvändbara saker ska tillbaka till sin normala plats.
    if (need.resource?.reusable !== false) {
      const bKey = stopKey("tillbaka", need.zoneId, need.place);
      const b = back.get(bKey);
      if (b) {
        if (!b.items.includes(name)) b.items.push(name);
      } else {
        back.set(bKey, {
          key: bKey,
          purpose: "tillbaka",
          zoneId: need.zoneId,
          zoneName: zoneName(need.zoneId),
          place: need.place,
          items: [name],
        });
      }
    }
  });

  const stops: RouteStop[] = [...pickup.values()];

  if (area) {
    stops.push({
      key: stopKey("utfor", area.id, null),
      purpose: "utfor",
      zoneId: area.id,
      zoneName: area.name,
      place: null,
      items: [taskName],
      minutes: minutes?.do ?? null,
    });
    if (checkpoints.length > 0) {
      stops.push({
        key: stopKey("kontrollera", area.id, null),
        purpose: "kontrollera",
        zoneId: area.id,
        zoneName: area.name,
        place: null,
        items: checkpoints,
        minutes: minutes?.check ?? null,
      });
    }
  }

  stops.push(...back.values());

  return withLegs(stops, zones, connections, pxPerMeter);
}

/** Räknar om etapper och summor för en given ordning av stoppen. */
export function withLegs(
  stops: RouteStop[],
  zones: ZoneLike[],
  connections: ZoneConnection[],
  pxPerMeter: number | null,
): WorkRoute {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < stops.length; i += 1) {
    legs.push(legBetween(zones, connections, stops[i - 1].zoneId, stops[i].zoneId, pxPerMeter));
  }
  const meters = legs.map((l) => l.meters).filter((m): m is number => m != null);
  const seconds = legs.map((l) => l.seconds).filter((s): s is number => s != null);
  return {
    stops,
    legs,
    totalMeters: meters.length > 0 ? Math.round(meters.reduce((a, b) => a + b, 0)) : null,
    walkSeconds: seconds.length > 0 ? seconds.reduce((a, b) => a + b, 0) : null,
    estimated: legs.some((l) => l.estimated),
  };
}

/**
 * Butikens standardordning läggs över de framräknade stoppen. Stopp som saknas
 * i standarden hamnar sist, och stopp som inte längre behövs faller bort.
 */
export function applyStandardRoute(
  route: WorkRoute,
  standard: StandardRoute | null,
  zones: ZoneLike[],
  connections: ZoneConnection[],
  pxPerMeter: number | null,
): WorkRoute {
  if (!standard || standard.route_mode !== "standard" || standard.stops.length === 0) return route;
  const order = standard.stops.map((s) => s.key);
  const sorted = [...route.stops].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
  return withLegs(sorted, zones, connections, pxPerMeter);
}

/**
 * Har en sak bytt område sedan standardvägen sparades? Flytt inom samma
 * område (ST-01 → ST-04) påverkar inte vägen och ska inte varna.
 */
export function routeDrift(standard: StandardRoute | null, route: WorkRoute): string[] {
  if (!standard || standard.route_mode !== "standard" || standard.stops.length === 0) return [];
  const savedZones = new Set(standard.stops.map((s) => s.key.split(":")[1]));
  const missing = route.stops
    .filter((s) => (s.purpose === "hamta" || s.purpose === "tillbaka") && !savedZones.has(s.zoneId ?? "utan-omrade"))
    .map((s) => `${s.items.join(", ")} finns nu i ${s.zoneName ?? "ett annat område"}`);
  return Array.from(new Set(missing));
}

export function walkText(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${Math.round(seconds)} sek`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m} min` : `${m} min ${s} sek`;
}

export const metersText = (meters: number | null) =>
  meters == null ? null : `${meters.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} m`;

/** Förflyttningens tid i minuter, avrundat uppåt till hel minut. */
export const walkMinutes = (seconds: number | null) => (seconds == null ? null : Math.ceil(seconds / 60));
