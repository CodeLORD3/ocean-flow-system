REVOKE EXECUTE ON FUNCTION public.is_store_scoped(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_store_scoped(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_store_scoped(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_scoped(uuid) TO service_role;