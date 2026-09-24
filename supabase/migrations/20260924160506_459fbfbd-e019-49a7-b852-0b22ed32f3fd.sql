DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.decide_customer_order_transfer(uuid,boolean,text)'::regprocedure);
  d := replace(d, 'reserved_quantity=null', 'reserved_quantity=0');
  EXECUTE d;
END $$;