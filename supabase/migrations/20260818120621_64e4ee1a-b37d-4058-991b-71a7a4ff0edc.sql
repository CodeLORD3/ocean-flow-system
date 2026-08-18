CREATE TABLE public.image_feature_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  day date NOT NULL,
  source text NOT NULL DEFAULT 'auto',
  image_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, day)
);

GRANT SELECT ON public.image_feature_runs TO authenticated;
GRANT ALL ON public.image_feature_runs TO service_role;

ALTER TABLE public.image_feature_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view feature runs"
ON public.image_feature_runs FOR SELECT TO authenticated
USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_image_feature_runs_updated_at
BEFORE UPDATE ON public.image_feature_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Markerar automatiskt de N senaste bilderna per enhet och dag som utvalda,
-- men bara för dagar som aldrig hanterats tidigare (auto eller manuellt).
CREATE OR REPLACE FUNCTION public.autofeature_daily_images(_days_back integer DEFAULT 14, _count integer DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  marked integer := 0;
  days integer := 0;
BEGIN
  FOR r IN
    SELECT i.entity_type,
           i.entity_id,
           (i.created_at AT TIME ZONE 'Europe/Stockholm')::date AS day
    FROM public.entity_images i
    WHERE i.entity_type IN ('store', 'portal')
      AND (i.created_at AT TIME ZONE 'Europe/Stockholm')::date
          >= ((now() AT TIME ZONE 'Europe/Stockholm')::date - _days_back)
    GROUP BY 1, 2, 3
    HAVING bool_and(NOT i.is_featured)
  LOOP
    -- Har dagen redan hanterats (auto eller manuellt urval)? Låt den vara.
    IF EXISTS (
      SELECT 1 FROM public.image_feature_runs fr
      WHERE fr.entity_type = r.entity_type
        AND fr.entity_id = r.entity_id
        AND fr.day = r.day
    ) THEN
      CONTINUE;
    END IF;

    WITH pick AS (
      SELECT id FROM public.entity_images
      WHERE entity_type = r.entity_type
        AND entity_id = r.entity_id
        AND (created_at AT TIME ZONE 'Europe/Stockholm')::date = r.day
      ORDER BY created_at DESC
      LIMIT _count
    ), upd AS (
      UPDATE public.entity_images SET is_featured = true
      WHERE id IN (SELECT id FROM pick)
      RETURNING 1
    )
    SELECT count(*) INTO marked FROM upd;

    INSERT INTO public.image_feature_runs (entity_type, entity_id, day, source, image_count)
    VALUES (r.entity_type, r.entity_id, r.day, 'auto', marked)
    ON CONFLICT (entity_type, entity_id, day) DO NOTHING;

    days := days + 1;
  END LOOP;

  RETURN jsonb_build_object('days_processed', days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.autofeature_daily_images(integer, integer) TO authenticated, service_role;

-- Registrerar att en enhet/dag hanterats manuellt så autourvalet inte skriver över.
CREATE OR REPLACE FUNCTION public.mark_image_feature_day(_entity_type text, _entity_id uuid, _day date, _count integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.image_feature_runs (entity_type, entity_id, day, source, image_count)
  VALUES (_entity_type, _entity_id, _day, 'manual', coalesce(_count, 0))
  ON CONFLICT (entity_type, entity_id, day)
  DO UPDATE SET source = 'manual', image_count = coalesce(_count, 0), updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.mark_image_feature_day(text, uuid, date, integer) TO authenticated, service_role;