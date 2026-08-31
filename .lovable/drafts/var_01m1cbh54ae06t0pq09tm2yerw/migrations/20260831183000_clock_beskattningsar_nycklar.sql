-- Etapp 2b, komplettering: nyckel per beskattningsår (SKVFS 2015:6) + gallring per år
-- Additiv: nya funktioner, ny genererad kolumn, ny nyckelkatalog. Inget tas bort.

-- 1) Beskattningsår ur svensk kalender (kalenderår för personalliggaren).
CREATE OR REPLACE FUNCTION public.beskattningsar(_ts timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT EXTRACT(YEAR FROM (_ts AT TIME ZONE 'Europe/Stockholm'))::integer
$$;
REVOKE ALL ON FUNCTION public.beskattningsar(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.beskattningsar(timestamptz) TO authenticated, service_role;

-- 2) Genererad kolumn så att varje stämpling hör till exakt ett beskattningsår.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS beskattningsar integer
  GENERATED ALWAYS AS (public.beskattningsar(occurred_at)) STORED;
CREATE INDEX IF NOT EXISTS time_entries_beskattningsar_idx
  ON public.time_entries (beskattningsar, employee_id);
COMMENT ON COLUMN public.time_entries.beskattningsar IS
  'Beskattningsår enligt svensk tid. Styr nyckelval och gallring per år.';

-- 3) Nyckelkatalog per beskattningsår. Själva nyckeln ligger i valvet, aldrig här.
CREATE TABLE IF NOT EXISTS public.pnr_key_years (
  beskattningsar integer PRIMARY KEY,
  vault_secret_name text NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  rotated_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  note text
);
GRANT SELECT ON public.pnr_key_years TO authenticated;
GRANT ALL ON public.pnr_key_years TO service_role;
ALTER TABLE public.pnr_key_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY pnr_key_years_admin_read ON public.pnr_key_years FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY pnr_key_years_admin_manage ON public.pnr_key_years FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Året som gäller nu registreras med den befintliga valvnyckeln som utgångspunkt.
INSERT INTO public.pnr_key_years (beskattningsar, vault_secret_name, note)
SELECT public.beskattningsar(now()), 'employee_pnr_key', 'Basnyckel, före första årsrotation'
ON CONFLICT (beskattningsar) DO NOTHING;

-- 4) Nyckelval per år, med basnyckeln som reserv så att äldre data förblir läsbar.
CREATE OR REPLACE FUNCTION public.employee_pnr_key_for_year(_year integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE nm text; key text;
BEGIN
  SELECT vault_secret_name INTO nm
  FROM public.pnr_key_years WHERE beskattningsar = _year AND is_active;
  IF nm IS NOT NULL THEN
    SELECT decrypted_secret INTO key FROM vault.decrypted_secrets WHERE name = nm LIMIT 1;
  END IF;
  IF key IS NULL THEN
    key := public.employee_pnr_key();
  END IF;
  IF key IS NULL THEN
    RAISE EXCEPTION 'Krypteringsnyckel saknas för beskattningsår %', _year;
  END IF;
  RETURN key;
END;
$$;
REVOKE ALL ON FUNCTION public.employee_pnr_key_for_year(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_pnr_key_for_year(integer) TO service_role;

-- 5) Gallring per beskattningsår: personalliggaren sparas innevarande år + sex år bakåt.
CREATE OR REPLACE FUNCTION public.purge_clock_years(_keep_years integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cutoff integer; n integer := 0;
BEGIN
  cutoff := public.beskattningsar(now()) - GREATEST(_keep_years, 1) + 1;
  INSERT INTO public.retention_log(table_name, row_id, retention_reason, metadata)
    SELECT 'time_entries', id, 'beskattningsår utanför lagringstid',
           jsonb_build_object('beskattningsar', beskattningsar)
    FROM public.time_entries WHERE beskattningsar < cutoff;
  DELETE FROM public.time_entries WHERE beskattningsar < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.pnr_key_years SET is_active = false WHERE beskattningsar < cutoff;
  RETURN jsonb_build_object('cutoff_beskattningsar', cutoff, 'time_entries', n);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clock_years(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clock_years(integer) TO service_role;

SELECT cron.schedule('clock-retention-years', '40 3 1 1 *', $$SELECT public.purge_clock_years(7);$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clock-retention-years');
