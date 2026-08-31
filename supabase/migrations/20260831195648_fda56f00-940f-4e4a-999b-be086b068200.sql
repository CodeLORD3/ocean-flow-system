REVOKE EXECUTE ON FUNCTION public.absence_generate_days(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.clock_code_hash(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.clock_station_create(text, uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.clock_station_rotate_code(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.preliminar_passkostnad(uuid, date, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.absence_generate_days(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_create(text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_rotate_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preliminar_passkostnad(uuid, date, integer) TO authenticated;