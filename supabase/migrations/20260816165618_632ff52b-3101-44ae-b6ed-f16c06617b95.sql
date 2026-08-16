DO $$
DECLARE
  r record;
  gate text;
  newq text;
  newc text;
  sql text;
BEGIN
  FOR r IN
    SELECT cl.relname AS tbl,
           p.polname AS pol,
           pg_get_expr(p.polqual, p.polrelid) AS q,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wc,
           EXISTS (SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema='public' AND c.table_name=cl.relname
                     AND c.column_name='legal_entity_id') AS has_le,
           EXISTS (SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema='public' AND c.table_name=cl.relname
                     AND c.column_name='store_id') AS has_store
    FROM pg_policy p
    JOIN pg_class cl ON cl.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    -- hoppa över tabeller utan bolagsstämpel
    IF NOT (r.has_le OR r.has_store) THEN CONTINUE; END IF;
    -- hoppa över redan bolagsspärrade policyer
    IF COALESCE(r.q,'') LIKE '%can_see_%' OR COALESCE(r.wc,'') LIKE '%can_see_%' THEN CONTINUE; END IF;
    -- bara personalbaserade / öppna policyer ska spärras
    IF NOT (COALESCE(r.q,'') LIKE '%is_staff%' OR COALESCE(r.wc,'') LIKE '%is_staff%'
            OR COALESCE(r.q,'') = 'true' OR COALESCE(r.wc,'') = 'true') THEN CONTINUE; END IF;

    IF r.has_le THEN
      gate := 'public.can_see_company(legal_entity_id)';
    ELSE
      gate := 'public.can_see_store(store_id)';
    END IF;

    sql := format('ALTER POLICY %I ON public.%I', r.pol, r.tbl);
    IF r.q IS NOT NULL THEN
      newq := format('((%s) AND %s)', r.q, gate);
      sql := sql || format(' USING (%s)', newq);
    END IF;
    IF r.wc IS NOT NULL THEN
      newc := format('((%s) AND %s)', r.wc, gate);
      sql := sql || format(' WITH CHECK (%s)', newc);
    END IF;

    EXECUTE sql;
  END LOOP;
END $$;