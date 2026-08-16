-- 1. Kvittorader: koppling till lagerrörelse/parti + granskning
ALTER TABLE public.pos_transaction_items
  ADD COLUMN IF NOT EXISTS movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_unit text,
  ADD COLUMN IF NOT EXISTS unit_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_by text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'ok';

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.nimpos_webhook_events
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pos_items_review_idx ON public.pos_transaction_items (review_status)
  WHERE review_status <> 'ok';

-- 2. Avvisade anrop
CREATE TABLE IF NOT EXISTS public.nimpos_rejects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,
  store_code text,
  event_id text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nimpos_rejects TO authenticated;
GRANT ALL ON public.nimpos_rejects TO service_role;
ALTER TABLE public.nimpos_rejects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read nimpos rejects" ON public.nimpos_rejects
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE INDEX IF NOT EXISTS nimpos_rejects_created_idx ON public.nimpos_rejects (created_at DESC);

-- 3. Nattlig avstämning
CREATE TABLE IF NOT EXISTS public.nimpos_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  store_code text,
  business_date date NOT NULL,
  external_count integer,
  external_total_ore bigint,
  local_count integer NOT NULL DEFAULT 0,
  local_total_ore bigint NOT NULL DEFAULT 0,
  missing_external_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date)
);
GRANT SELECT ON public.nimpos_reconciliations TO authenticated;
GRANT ALL ON public.nimpos_reconciliations TO service_role;
ALTER TABLE public.nimpos_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read nimpos reconciliations" ON public.nimpos_reconciliations
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE TRIGGER nimpos_recon_updated_at BEFORE UPDATE ON public.nimpos_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. FEFO-plock ur rörelseloggen
CREATE OR REPLACE FUNCTION public.pos_fefo_lots(_product_id uuid, _location_id uuid)
RETURNS TABLE(lot_id uuid, available numeric, best_before date, unit_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.lot_id,
         round(sum(m.quantity_kg)::numeric, 3) AS available,
         l.best_before,
         l.unit_cost
  FROM stock_movements m
  LEFT JOIN lots l ON l.id = m.lot_id
  WHERE m.product_id = _product_id
    AND m.location_id = _location_id
    AND m.lot_id IS NOT NULL
  GROUP BY m.lot_id, l.best_before, l.unit_cost
  HAVING sum(m.quantity_kg) > 0
  ORDER BY l.best_before ASC NULLS LAST, m.lot_id
$$;

-- 5. Kassahälsa för Systemstatus
CREATE OR REPLACE FUNCTION public.nimpos_health(_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;