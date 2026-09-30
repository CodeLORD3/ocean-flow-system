DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.clock_ops_day'::regproc);
  d := replace(d, 'WHERE x.work_date = d.day GROUP BY x.store_id', 'WHERE x.work_date = d.day AND x.handled_at IS NULL GROUP BY x.store_id');
  EXECUTE d;
END $$;