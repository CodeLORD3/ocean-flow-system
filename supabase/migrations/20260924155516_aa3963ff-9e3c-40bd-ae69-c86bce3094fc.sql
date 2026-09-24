DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.request_customer_order_transfer(uuid,uuid,text)'::regprocedure);
  d := replace(d, $x$IF o.pack_status = 'packad' OR o.status IN ('packad','levererad','avhamtad','avbruten','delvis_utlamnad')$x$, $x$IF o.status IN ('levererad','avhamtad','avbruten','delvis_utlamnad')$x$);
  d := replace(d, $x$'Beställningen kan inte flyttas när den är packad, utlämnad, avbruten eller arkiverad.'$x$, $x$'Beställningen kan inte flyttas när den är utlämnad, avbruten eller arkiverad.'$x$);
  d := replace(d, $x$IF EXISTS (SELECT 1 FROM customer_order_lines WHERE customer_order_id=_order_id AND pack_status='packad') THEN
    RAISE EXCEPTION 'Beställningen har redan packade rader och kan inte flyttas.'; END IF;$x$, '');
  EXECUTE d;
END $$;