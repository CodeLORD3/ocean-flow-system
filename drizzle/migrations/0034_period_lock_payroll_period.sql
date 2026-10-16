CREATE OR REPLACE FUNCTION public.period_is_locked(_store_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.period_locks pl
    WHERE pl.store_id = _store_id
      AND pl.period = to_char(_date + CASE WHEN extract(day FROM _date) >= 16 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM')
      AND pl.unlocked_at IS NULL
  )
$$;