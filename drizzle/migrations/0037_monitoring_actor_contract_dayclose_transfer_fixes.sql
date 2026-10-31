ALTER FUNCTION public.ai_set_uppdaterad_av() SECURITY DEFINER;
ALTER FUNCTION public.ai_set_uppdaterad_av() SET search_path = public;

DO $fix$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.contract_signer_data(uuid)'::regprocedure);
  definition := replace(definition, 'mgr_emp record;', 'mgr_emp public.employees%ROWTYPE;');
  definition := replace(definition, 'IF c IS NULL THEN', 'IF c.id IS NULL THEN');
  definition := replace(definition, 'IF mgr IS NOT NULL THEN', 'IF mgr.id IS NOT NULL THEN');
  definition := replace(definition, 'CASE WHEN mgr IS NULL THEN', 'CASE WHEN mgr.id IS NULL THEN');
  EXECUTE definition;
  definition := pg_get_functiondef('public.dagsavslut_status(uuid,date)'::regprocedure);
  definition := replace(definition, 'so.status <> ''Avbruten''', 'so.status NOT IN (''Avbruten'', ''Öppen'')');
  EXECUTE definition;
  definition := pg_get_functiondef('public._dagslage(date)'::regprocedure);
  definition := replace(definition, 'so.status <> ''Avbruten''', 'so.status NOT IN (''Avbruten'', ''Öppen'')');
  EXECUTE definition;
END $fix$;

-- Expose only the existing approval-box summary, not cross-store order access.
CREATE OR REPLACE FUNCTION public.pending_customer_order_transfer_summaries()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('customer_orders',
    jsonb_build_object('order_number', o.order_number, 'customer_name_snapshot', o.customer_name_snapshot,
      'wanted_date', o.wanted_date, 'wanted_time', o.wanted_time,
      'customer_order_lines', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id)), '[]'::jsonb)
        FROM public.customer_order_lines l WHERE l.customer_order_id = t.order_id)))
    ORDER BY t.requested_at), '[]'::jsonb)
  FROM public.customer_order_transfers t JOIN public.customer_orders o ON o.id = t.order_id
  WHERE auth.uid() IS NOT NULL AND public.is_staff() AND t.status = 'vantar'
    AND (public.can_see_store(t.from_store_id) OR public.can_see_store(t.to_store_id));
$function$;
REVOKE ALL ON FUNCTION public.pending_customer_order_transfer_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_customer_order_transfer_summaries() TO authenticated, service_role;