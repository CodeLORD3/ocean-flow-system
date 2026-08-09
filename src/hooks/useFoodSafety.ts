import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Egenkontroll: kontrollpunkter, mätningar, avvikelser, lagkrav och instrument.
 * Statussättning och avvikelseskapande sker i databasen, klienten bara visar.
 */

export const CONTROL_CATEGORIES = [
  "temperatur",
  "mikrobiologi",
  "rengöring",
  "skadedjur",
  "kalibrering",
  "utbildning",
  "övrigt",
] as const;

export const FREQUENCIES = ["dagligen", "veckovis", "månadsvis", "kvartalsvis", "årligen"] as const;

export interface ControlPoint {
  id: string;
  name: string;
  category: string;
  location_id: string | null;
  establishment_id: string | null;
  store_id: string | null;
  unit: string;
  limit_min: number | null;
  limit_max: number | null;
  frequency: string;
  responsible_role: string | null;
  zone: number | null;
  instrument_id: string | null;
  note: string | null;
  active: boolean;
}

export interface ControlRecord {
  id: string;
  control_point_id: string;
  value_numeric: number | null;
  value_text: string | null;
  value_bool: boolean | null;
  measured_at: string;
  status: string;
  comment: string | null;
  lot_id: string | null;
  deviation_id: string | null;
  instrument_id: string | null;
}

export interface Deviation {
  id: string;
  source: string;
  source_id: string | null;
  title: string | null;
  description: string;
  immediate_action: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  responsible: string | null;
  due_date: string | null;
  verification: string | null;
  closed_at: string | null;
  store_id: string | null;
  created_at: string;
}

export interface ComplianceRequirement {
  id: string;
  title: string;
  regulation: string | null;
  establishment_id: string | null;
  store_id: string | null;
  interval_months: number;
  last_done: string | null;
  next_due: string | null;
  responsible: string | null;
  document_name: string | null;
  note: string | null;
  active: boolean;
}

export interface Instrument {
  id: string;
  name: string;
  instrument_type: string;
  serial_number: string | null;
  placement: string | null;
  store_id: string | null;
  calibration_interval_months: number;
  last_calibrated: string | null;
  next_calibration: string | null;
  active: boolean;
}

const table = (name: string) => supabase.from(name as any);

export function useControlPoints(storeId?: string | null) {
  return useQuery({
    queryKey: ["control_points", storeId ?? "all"],
    queryFn: async () => {
      let q = table("control_points").select("*").eq("active", true).order("category").order("name");
      if (storeId) q = q.or(`store_id.eq.${storeId},store_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as ControlPoint[];
    },
  });
}

/** Dagens mätningar, för att veta vad som redan är avklarat. */
export function useTodaysRecords() {
  return useQuery({
    queryKey: ["control_records", "today"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await table("control_records")
        .select("*")
        .gte("measured_at", start.toISOString())
        .order("measured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as ControlRecord[];
    },
  });
}

/** 30 dagars historik för en kontrollpunkt, för trendvyn. */
export function useControlTrend(controlPointId: string | null) {
  return useQuery({
    queryKey: ["control_records", "trend", controlPointId],
    enabled: !!controlPointId,
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data, error } = await table("control_records")
        .select("*")
        .eq("control_point_id", controlPointId!)
        .gte("measured_at", from)
        .order("measured_at");
      if (error) throw error;
      return (data ?? []) as any as ControlRecord[];
    },
  });
}

export function useSaveControlPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ControlPoint>) => {
      const payload: Record<string, any> = {
        name: input.name,
        category: input.category ?? "temperatur",
        unit: input.unit ?? "grader C",
        limit_min: input.limit_min ?? null,
        limit_max: input.limit_max ?? null,
        frequency: input.frequency ?? "dagligen",
        responsible_role: input.responsible_role || null,
        zone: input.zone ?? null,
        location_id: input.location_id || null,
        store_id: input.store_id || null,
        establishment_id: input.establishment_id || null,
        instrument_id: input.instrument_id || null,
        note: input.note || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await table("control_points").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await table("control_points").insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["control_points"] }),
  });
}

export function useRegisterMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      controlPointId: string;
      valueNumeric?: number | null;
      valueBool?: boolean | null;
      valueText?: string | null;
      comment?: string | null;
      lotId?: string | null;
      instrumentId?: string | null;
    }) => {
      const { data: staff } = await table("staff").select("id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      const { data, error } = await table("control_records")
        .insert({
          control_point_id: input.controlPointId,
          value_numeric: input.valueNumeric ?? null,
          value_bool: input.valueBool ?? null,
          value_text: input.valueText ?? null,
          comment: input.comment || null,
          lot_id: input.lotId || null,
          instrument_id: input.instrumentId || null,
          measured_by: (staff as any)?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as any as ControlRecord;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["control_records"] });
      qc.invalidateQueries({ queryKey: ["deviations"] });
    },
  });
}

export function useDeviations(includeClosed = false) {
  return useQuery({
    queryKey: ["deviations", includeClosed],
    queryFn: async () => {
      let q = table("deviations").select("*").order("created_at", { ascending: false }).limit(300);
      if (!includeClosed) q = q.is("closed_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as Deviation[];
    },
  });
}

export function useSaveDeviation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Deviation> & { close?: boolean }) => {
      const payload: Record<string, any> = {
        description: input.description,
        title: input.title || null,
        source: input.source ?? "övrigt",
        immediate_action: input.immediate_action || null,
        root_cause: input.root_cause || null,
        corrective_action: input.corrective_action || null,
        responsible: input.responsible || null,
        due_date: input.due_date || null,
        verification: input.verification || null,
        store_id: input.store_id || null,
      };
      if (input.close) payload.closed_at = new Date().toISOString();
      if (input.id) {
        const { error } = await table("deviations").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await table("deviations").insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deviations"] }),
  });
}

export function useComplianceRequirements() {
  return useQuery({
    queryKey: ["compliance_requirements"],
    queryFn: async () => {
      const { data, error } = await table("compliance_requirements")
        .select("*")
        .eq("active", true)
        .order("next_due", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any as ComplianceRequirement[];
    },
  });
}

export function useSaveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ComplianceRequirement>) => {
      const payload: Record<string, any> = {
        title: input.title,
        regulation: input.regulation || null,
        establishment_id: input.establishment_id || null,
        store_id: input.store_id || null,
        interval_months: input.interval_months ?? 12,
        last_done: input.last_done || null,
        responsible: input.responsible || null,
        note: input.note || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await table("compliance_requirements").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await table("compliance_requirements").insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance_requirements"] }),
  });
}

export function useInstruments() {
  return useQuery({
    queryKey: ["instruments"],
    queryFn: async () => {
      const { data, error } = await table("instruments")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any as Instrument[];
    },
  });
}

export function useSaveInstrument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Instrument>) => {
      const payload: Record<string, any> = {
        name: input.name,
        instrument_type: input.instrument_type ?? "termometer",
        serial_number: input.serial_number || null,
        placement: input.placement || null,
        store_id: input.store_id || null,
        calibration_interval_months: input.calibration_interval_months ?? 12,
        last_calibrated: input.last_calibrated || null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await table("instruments").update(payload).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await table("instruments").insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instruments"] }),
  });
}

/** Grundförutsättningar enligt del 5C — läggs upp på begäran, inte automatiskt. */
export const BASELINE_REQUIREMENTS: {
  title: string;
  regulation: string;
  interval_months: number;
}[] = [
  { title: "Kalibrering av termometrar", regulation: "852/2004 bilaga II", interval_months: 12 },
  { title: "Vågverifiering av ackrediterat organ", regulation: "Mätinstrumentdirektivet", interval_months: 12 },
  { title: "Köldmediakontroll med rapport till miljöförvaltningen", regulation: "SFS 2016:1128", interval_months: 12 },
  { title: "Hygienutbildning per anställd", regulation: "852/2004 bilaga II kap XII", interval_months: 48 },
  { title: "Skadedjurskontroll, besöksrapport från entreprenör", regulation: "852/2004", interval_months: 1 },
  { title: "Genomgång av personalhygien och sjukdomsrapportering", regulation: "852/2004 bilaga II kap VIII", interval_months: 12 },
  { title: "Handelsdokument för animaliska biprodukter", regulation: "1069/2009", interval_months: 1 },
];

/**
 * Rengöring per yta och utrymme, personalhygien och sjukdomsrapportering samt
 * handelsdokument för animaliska biprodukter. Zonen anger renhetsgrad:
 * 1 beredning, 2 butik och disk, 3 mottagning och lager, 4 avfall och personalutrymmen.
 */
export const BASELINE_CONTROL_POINTS: Partial<ControlPoint>[] = [
  // Rengöring per yta och utrymme
  { name: "Rengöring, skärbräda och knivar", category: "rengöring", unit: "ja/nej", frequency: "dagligen", zone: 1 },
  { name: "Rengöring, filébänk och arbetsytor", category: "rengöring", unit: "ja/nej", frequency: "dagligen", zone: 1 },
  { name: "Rengöring, fiskdisk och glas", category: "rengöring", unit: "ja/nej", frequency: "dagligen", zone: 2 },
  { name: "Rengöring, golv och golvbrunn i butik", category: "rengöring", unit: "ja/nej", frequency: "dagligen", zone: 2 },
  { name: "Rengöring, kyl- och frysrum invändigt", category: "rengöring", unit: "ja/nej", frequency: "veckovis", zone: 3 },
  { name: "Rengöring, varumottagning och lastkaj", category: "rengöring", unit: "ja/nej", frequency: "veckovis", zone: 3 },
  { name: "Rengöring, maskiner och skärutrustning isärtagna", category: "rengöring", unit: "ja/nej", frequency: "veckovis", zone: 1 },
  { name: "Rengöring, avfallsutrymme och kärl", category: "rengöring", unit: "ja/nej", frequency: "veckovis", zone: 4 },
  { name: "Rengöring, personalutrymme och omklädning", category: "rengöring", unit: "ja/nej", frequency: "veckovis", zone: 4 },
  { name: "Rengöring, storstädning tak, väggar och ventilation", category: "rengöring", unit: "ja/nej", frequency: "månadsvis", zone: 1 },
  // Personalhygien och sjukdomsrapportering
  { name: "Personalhygien, arbetskläder och handtvätt", category: "utbildning", unit: "ja/nej", frequency: "dagligen", zone: 1 },
  { name: "Sjukdomsrapportering, ingen med magsjuka eller sår i arbete", category: "utbildning", unit: "ja/nej", frequency: "dagligen", zone: 1 },
  { name: "Personalhygien, kontroll av handtvättställ och engångsmaterial", category: "utbildning", unit: "ja/nej", frequency: "veckovis", zone: 4 },
  // Skadedjur och animaliska biprodukter
  { name: "Skadedjurskontroll, egen rundvandring och betesstationer", category: "skadedjur", unit: "ja/nej", frequency: "månadsvis", zone: 3 },
  { name: "Animaliska biprodukter, handelsdokument vid varje hämtning", category: "övrigt", unit: "ja/nej", frequency: "veckovis", zone: 4 },
];


export function useSeedBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const [reqs, points] = await Promise.all([
        table("compliance_requirements").select("title"),
        table("control_points").select("name"),
      ]);
      const haveReq = new Set(((reqs.data ?? []) as any[]).map((r) => r.title));
      const havePoint = new Set(((points.data ?? []) as any[]).map((r) => r.name));

      const newReqs = BASELINE_REQUIREMENTS.filter((r) => !haveReq.has(r.title));
      const newPoints = BASELINE_CONTROL_POINTS.filter((p) => !havePoint.has(p.name!));

      if (newReqs.length) {
        const { error } = await table("compliance_requirements").insert(newReqs);
        if (error) throw error;
      }
      if (newPoints.length) {
        const { error } = await table("control_points").insert(newPoints);
        if (error) throw error;
      }
      return { requirements: newReqs.length, points: newPoints.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance_requirements"] });
      qc.invalidateQueries({ queryKey: ["control_points"] });
    },
  });
}

/** Dagar till förfall, negativt betyder förfallet. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00").getTime();
  return Math.round((d - new Date().setHours(0, 0, 0, 0)) / 864e5);
}

export function requirementStatus(next_due: string | null): "aktuell" | "snart" | "forfallen" | "okänd" {
  const d = daysUntil(next_due);
  if (d === null) return "okänd";
  if (d < 0) return "forfallen";
  if (d <= 60) return "snart";
  return "aktuell";
}
