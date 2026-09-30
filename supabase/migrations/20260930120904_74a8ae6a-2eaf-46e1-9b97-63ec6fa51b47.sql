CREATE OR REPLACE FUNCTION public.nimpos_health(_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _from timestamptz := (_date::text || ' 00:00:00')::timestamptz;
  _to   timestamptz := (_date::text || ' 23:59:59.999')::timestamptz;
  _stores jsonb;
  _rejects jsonb;
  _recon jsonb;
  _unmatched integer;
  _mismatch integer;
  _returns integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_staff() OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO _stores
  FROM (
    SELECT jsonb_build_object(
             'store_id', s.id,
             'name', s.name,
             'store_code', m.store_code,
             'receipts', coalesce(t.cnt, 0),
             'total_ore', coalesce(t.total, 0),
             'last_receipt_at', t.last_at,
             'silent_minutes', CASE WHEN t.last_at IS NULL THEN NULL
                                    ELSE floor(extract(epoch FROM (now() - t.last_at)) / 60)::int END
           ) AS x
    FROM nimpos_store_map m
    JOIN stores s ON s.id = m.store_id
    LEFT JOIN (
      SELECT store_id, count(*) cnt, sum(total_ore) total, max(occurred_at) last_at
      FROM pos_transactions
      WHERE source = 'nimpos' AND test_mode = false AND parked = false
        AND occurred_at BETWEEN _from AND _to
      GROUP BY store_id
    ) t ON t.store_id = s.id
    WHERE m.active
  ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'store_code', store_code, 'count', cnt)), '[]'::jsonb)
    INTO _rejects
  FROM (
    SELECT reason, store_code, count(*) cnt
    FROM nimpos_rejects
    WHERE created_at BETWEEN _from AND _to
    GROUP BY reason, store_code
  ) r;

  SELECT count(*) INTO _unmatched
  FROM pos_transaction_items i
  JOIN pos_transactions t ON t.id = i.transaction_id
  WHERE t.source = 'nimpos' AND i.product_id IS NULL
    AND t.occurred_at BETWEEN _from AND _to;

  SELECT count(*) INTO _mismatch
  FROM pos_transaction_items i
  JOIN pos_transactions t ON t.id = i.transaction_id
  WHERE t.source = 'nimpos' AND i.unit_mismatch
    AND t.occurred_at BETWEEN _from AND _to;

  SELECT count(*) INTO _returns
  FROM pos_transactions
  WHERE source = 'nimpos' AND status = 'reversed'
    AND occurred_at BETWEEN _from AND _to;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'store_code', r.store_code, 'business_date', r.business_date,
           'status', r.status, 'external_count', r.external_count,
           'local_count', r.local_count, 'external_total_ore', r.external_total_ore,
           'local_total_ore', r.local_total_ore,
           'missing', jsonb_array_length(r.missing_external_ids),
           'message', r.message)), '[]'::jsonb)
    INTO _recon
  FROM nimpos_reconciliations r
  WHERE r.business_date >= _date - 1;

  RETURN jsonb_build_object(
    'date', _date,
    'stores', _stores,
    'rejects', _rejects,
    'unmatched_lines', _unmatched,
    'unit_mismatches', _mismatch,
    'returns', _returns,
    'reconciliations', _recon,
    'queued', (SELECT count(*) FROM nimpos_webhook_events WHERE status IN ('koad','pending')),
    'parked', (SELECT count(*) FROM nimpos_webhook_events WHERE status IN ('failed','unmapped_store'))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_event(_portals text[], _page text, _store uuid, _msg text, _etype text, _eid text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_staff() OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, entity_id)
  SELECT p, _page, _store, _msg, _etype, _eid FROM unnest(_portals) AS p;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nimpos_health(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_event(text[], text, uuid, text, text, text) TO authenticated;