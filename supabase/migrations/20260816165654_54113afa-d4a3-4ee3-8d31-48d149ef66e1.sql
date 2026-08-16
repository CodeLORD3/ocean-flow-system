DO $$
DECLARE
  r record;
  gate text;
  sql text;
BEGIN
  FOR r IN
    WITH stamped AS (
      SELECT c.table_name,
             bool_or(c.column_name = 'legal_entity_id') AS has_le,
             bool_or(c.column_name = 'store_id') AS has_store
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name IN ('legal_entity_id','store_id')
      GROUP BY c.table_name
    ),
    fks AS (
      SELECT con.conrelid::regclass::text AS child,
             child_col.attname AS child_col,
             con.confrelid::regclass::text AS parent,
             parent_col.attname AS parent_col,
             row_number() OVER (PARTITION BY con.conrelid ORDER BY con.oid) AS rn
      FROM pg_constraint con
      JOIN pg_attribute child_col
        ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
      JOIN pg_attribute parent_col
        ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1
        AND con.connamespace = 'public'::regnamespace
    )
    SELECT p.polname AS pol,
           cl.relname AS tbl,
           pg_get_expr(p.polqual, p.polrelid) AS q,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wc,
           f.child_col, f.parent, f.parent_col,
           s.has_le, s.has_store
    FROM pg_policy p
    JOIN pg_class cl ON cl.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN fks f ON f.child = cl.relname
    JOIN stamped s ON s.table_name = f.parent
    LEFT JOIN stamped own ON own.table_name = cl.relname
    WHERE n.nspname = 'public'
      AND own.table_name IS NULL
      AND f.rn = 1
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid),'') LIKE '%is_staff%'
           OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid),'') LIKE '%is_staff%')
      AND COALESCE(pg_get_expr(p.polqual, p.polrelid),'') NOT LIKE '%can_see_%'
      AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid),'') NOT LIKE '%can_see_%'
  LOOP
    IF r.has_le THEN
      gate := format(
        '(%I IS NULL OR EXISTS (SELECT 1 FROM public.%I par WHERE par.%I = %I.%I AND public.can_see_company(par.legal_entity_id)))',
        r.child_col, r.parent, r.parent_col, r.tbl, r.child_col);
    ELSE
      gate := format(
        '(%I IS NULL OR EXISTS (SELECT 1 FROM public.%I par WHERE par.%I = %I.%I AND public.can_see_store(par.store_id)))',
        r.child_col, r.parent, r.parent_col, r.tbl, r.child_col);
    END IF;

    sql := format('ALTER POLICY %I ON public.%I', r.pol, r.tbl);
    IF r.q IS NOT NULL THEN
      sql := sql || format(' USING ((%s) AND %s)', r.q, gate);
    END IF;
    IF r.wc IS NOT NULL THEN
      sql := sql || format(' WITH CHECK ((%s) AND %s)', r.wc, gate);
    END IF;

    BEGIN
      EXECUTE sql;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Hoppade över %.%: %', r.tbl, r.pol, SQLERRM;
    END;
  END LOOP;
END $$;