REVOKE ALL ON FUNCTION public.finalize_lot_price(uuid, numeric, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_lot_price(uuid, numeric, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_lot_price(uuid, numeric, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_lot_price(uuid, numeric, text, date) TO service_role;