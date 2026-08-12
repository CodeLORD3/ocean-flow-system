CREATE OR REPLACE FUNCTION public.zero_stale_day_prices_midnight()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kör bara när det är midnattstimmen i svensk tid (hanterar sommartid).
  IF EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/Stockholm')) <> 0 THEN
    RETURN 0;
  END IF;
  RETURN public.zero_stale_day_prices();
END;
$$;

GRANT EXECUTE ON FUNCTION public.zero_stale_day_prices_midnight() TO service_role;