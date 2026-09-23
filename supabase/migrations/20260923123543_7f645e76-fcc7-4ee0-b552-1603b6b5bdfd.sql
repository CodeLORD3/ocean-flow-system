-- ============================================================
-- Steg 0: gräns mellan uppgifter och checklistor + gemensamt schema
-- ============================================================

-- DEL A: vyer med rätt begrepp (RLS från underliggande tabeller)
DROP VIEW IF EXISTS public.task_definitions;
CREATE VIEW public.task_definitions WITH (security_invoker = true) AS
  SELECT * FROM public.checklist_template_items;

DROP VIEW IF EXISTS public.task_occurrences;
CREATE VIEW public.task_occurrences WITH (security_invoker = true) AS
  SELECT * FROM public.checklist_items;

GRANT SELECT ON public.task_definitions TO authenticated;
GRANT SELECT ON public.task_definitions TO service_role;
GRANT SELECT ON public.task_occurrences TO authenticated;
GRANT SELECT ON public.task_occurrences TO service_role;

-- DEL B: gemensam schemamodell
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('task','checklist')),
  owner_id uuid NOT NULL,
  rule jsonb NOT NULL DEFAULT '{"type":"daily"}'::jsonb,
  start_date date,
  end_date date,
  times jsonb,
  skip_closed_days boolean NOT NULL DEFAULT true,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS schedules_owner_store_uniq
  ON public.schedules (owner_type, owner_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS schedules_store_idx ON public.schedules (store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal kan se scheman" ON public.schedules;
CREATE POLICY "Personal kan se scheman" ON public.schedules
  FOR SELECT TO authenticated
  USING (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)));

DROP POLICY IF EXISTS "Personal kan hantera scheman" ON public.schedules;
CREATE POLICY "Personal kan hantera scheman" ON public.schedules
  FOR ALL TO authenticated
  USING (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)))
  WITH CHECK (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)));

DROP TRIGGER IF EXISTS schedules_touch ON public.schedules;
CREATE TRIGGER schedules_touch BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stängda dagar per butik
CREATE TABLE IF NOT EXISTS public.store_closed_days (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_closed_days TO authenticated;
GRANT ALL ON public.store_closed_days TO service_role;
ALTER TABLE public.store_closed_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal kan se stangda dagar" ON public.store_closed_days;
CREATE POLICY "Personal kan se stangda dagar" ON public.store_closed_days
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_store(store_id));

DROP POLICY IF EXISTS "Admin kan hantera stangda dagar" ON public.store_closed_days;
CREATE POLICY "Admin kan hantera stangda dagar" ON public.store_closed_days
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Backfill: veckodagar -> schedules
-- checklist_templates: 0 = sondag i gamla data, mappas till ISO 7
INSERT INTO public.schedules (owner_type, owner_id, store_id, rule, active)
SELECT 'checklist', t.id, t.store_id,
  CASE
    WHEN t.weekdays IS NOT NULL AND array_length(t.weekdays, 1) > 0
      THEN jsonb_build_object('type','weekdays','days', (
        SELECT jsonb_agg(DISTINCT CASE WHEN d = 0 THEN 7 ELSE d END ORDER BY CASE WHEN d = 0 THEN 7 ELSE d END)
        FROM unnest(t.weekdays) AS d
      ))
    ELSE '{"type":"daily"}'::jsonb
  END,
  coalesce(t.active, true)
FROM public.checklist_templates t
ON CONFLICT DO NOTHING;

-- checklist_template_items: egna weekdays (ISO), annars mallens (0 -> 7), annars dagligen
INSERT INTO public.schedules (owner_type, owner_id, store_id, rule, active)
SELECT 'task', i.id, i.store_id,
  CASE
    WHEN i.weekdays IS NOT NULL AND array_length(i.weekdays, 1) > 0
      THEN jsonb_build_object('type','weekdays','days', (
        SELECT jsonb_agg(DISTINCT d ORDER BY d) FROM unnest(i.weekdays) AS d
      ))
    WHEN t.weekdays IS NOT NULL AND array_length(t.weekdays, 1) > 0
      THEN jsonb_build_object('type','weekdays','days', (
        SELECT jsonb_agg(DISTINCT CASE WHEN d = 0 THEN 7 ELSE d END ORDER BY CASE WHEN d = 0 THEN 7 ELSE d END)
        FROM unnest(t.weekdays) AS d
      ))
    ELSE '{"type":"daily"}'::jsonb
  END,
  true
FROM public.checklist_template_items i
LEFT JOIN public.checklist_templates t ON t.id = i.template_id
WHERE coalesce(i.active, true) = true
ON CONFLICT DO NOTHING;

-- DEL C: platshallare for checklistor
CREATE TABLE IF NOT EXISTS public.checklist_defs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'annat' CHECK (category IN ('oppning','stangning','haccp','annat')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checklist_def_points (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  def_id uuid NOT NULL REFERENCES public.checklist_defs(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  point_type text NOT NULL DEFAULT 'ok_avvikelse' CHECK (point_type IN ('ok_avvikelse','varde_min_max','bild')),
  min_value numeric,
  max_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_def_points_def_idx ON public.checklist_def_points (def_id, sort_order);

CREATE TABLE IF NOT EXISTS public.checklist_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  def_id uuid NOT NULL REFERENCES public.checklist_defs(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  run_date date NOT NULL DEFAULT current_date,
  run_time time,
  status text NOT NULL DEFAULT 'pagar' CHECK (status IN ('pagar','klar','signerad')),
  signed_by uuid,
  signed_at timestamptz,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_runs_store_date_idx ON public.checklist_runs (store_id, run_date);

CREATE TABLE IF NOT EXISTS public.checklist_run_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  point_id uuid NOT NULL REFERENCES public.checklist_def_points(id) ON DELETE CASCADE,
  result text,
  value numeric,
  comment text,
  image_id uuid,
  staff_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_run_results_run_idx ON public.checklist_run_results (run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_defs TO authenticated;
GRANT ALL ON public.checklist_defs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_def_points TO authenticated;
GRANT ALL ON public.checklist_def_points TO service_role;
GRANT SELECT ON public.checklist_runs TO authenticated;
GRANT ALL ON public.checklist_runs TO service_role;
GRANT SELECT ON public.checklist_run_results TO authenticated;
GRANT ALL ON public.checklist_run_results TO service_role;

ALTER TABLE public.checklist_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_def_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_run_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal kan se checklistmallar" ON public.checklist_defs;
CREATE POLICY "Personal kan se checklistmallar" ON public.checklist_defs
  FOR SELECT TO authenticated
  USING (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)));

DROP POLICY IF EXISTS "Admin kan hantera checklistmallar" ON public.checklist_defs;
CREATE POLICY "Admin kan hantera checklistmallar" ON public.checklist_defs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Personal kan se checklistpunkter" ON public.checklist_def_points;
CREATE POLICY "Personal kan se checklistpunkter" ON public.checklist_def_points
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Admin kan hantera checklistpunkter" ON public.checklist_def_points;
CREATE POLICY "Admin kan hantera checklistpunkter" ON public.checklist_def_points
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Endast lasning for authenticated. Skrivning sker via security definer-funktioner (steg 3).
DROP POLICY IF EXISTS "Personal kan se checklistkorningar" ON public.checklist_runs;
CREATE POLICY "Personal kan se checklistkorningar" ON public.checklist_runs
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_store(store_id));

DROP POLICY IF EXISTS "Personal kan se checklistresultat" ON public.checklist_run_results;
CREATE POLICY "Personal kan se checklistresultat" ON public.checklist_run_results
  FOR SELECT TO authenticated
  USING (public.is_staff() AND EXISTS (
    SELECT 1 FROM public.checklist_runs r
    WHERE r.id = run_id AND public.can_see_store(r.store_id)
  ));

-- Lasning: resultat i en last korning kan varken andras eller tas bort
CREATE OR REPLACE FUNCTION public.checklist_run_results_locked_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT locked INTO v_locked FROM public.checklist_runs
   WHERE id = coalesce(NEW.run_id, OLD.run_id);
  IF coalesce(v_locked, false) THEN
    RAISE EXCEPTION 'Checklistan är signerad och låst. Resultaten kan varken ändras eller tas bort.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS checklist_run_results_locked_guard ON public.checklist_run_results;
CREATE TRIGGER checklist_run_results_locked_guard
  BEFORE UPDATE OR DELETE ON public.checklist_run_results
  FOR EACH ROW EXECUTE FUNCTION public.checklist_run_results_locked_guard();

-- Lasning: en last korning kan inte lasas upp och inte tas bort
CREATE OR REPLACE FUNCTION public.checklist_runs_locked_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.locked, false) THEN
      RAISE EXCEPTION 'Checklistan är signerad och låst. Körningen kan inte tas bort.';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(OLD.locked, false) AND NOT coalesce(NEW.locked, false) THEN
    RAISE EXCEPTION 'Checklistan är signerad och låst. Låsningen kan inte tas bort.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklist_runs_locked_guard ON public.checklist_runs;
CREATE TRIGGER checklist_runs_locked_guard
  BEFORE UPDATE OR DELETE ON public.checklist_runs
  FOR EACH ROW EXECUTE FUNCTION public.checklist_runs_locked_guard();

DROP TRIGGER IF EXISTS checklist_defs_touch ON public.checklist_defs;
CREATE TRIGGER checklist_defs_touch BEFORE UPDATE ON public.checklist_defs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS checklist_def_points_touch ON public.checklist_def_points;
CREATE TRIGGER checklist_def_points_touch BEFORE UPDATE ON public.checklist_def_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS checklist_runs_touch ON public.checklist_runs;
CREATE TRIGGER checklist_runs_touch BEFORE UPDATE ON public.checklist_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Uppgift kan krava en checklista
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS requires_checklist_def_id uuid REFERENCES public.checklist_defs(id) ON DELETE SET NULL;