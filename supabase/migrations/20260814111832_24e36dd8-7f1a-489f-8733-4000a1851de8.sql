ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS booking_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_blocked_by uuid,
  ADD COLUMN IF NOT EXISTS booking_block_reason text;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_by uuid;

CREATE TABLE IF NOT EXISTS public.booking_block_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers_retail(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('sparr', 'havning')),
  reason text,
  actor_user_id uuid,
  actor_name text,
  phone_normalized text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.booking_block_audit TO authenticated;
GRANT ALL ON public.booking_block_audit TO service_role;

ALTER TABLE public.booking_block_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan läsa spärrhistoriken"
  ON public.booking_block_audit FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "Personal kan logga spärrbeslut"
  ON public.booking_block_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE INDEX IF NOT EXISTS booking_block_audit_customer_idx
  ON public.booking_block_audit (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.booking_status_day(_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := COALESCE(_day, (now() AT TIME ZONE 'Europe/Stockholm')::date);
  t_from timestamptz := (d::timestamp AT TIME ZONE 'Europe/Stockholm');
  t_to timestamptz := ((d + 1)::timestamp AT TIME ZONE 'Europe/Stockholm');
  per_store jsonb;
  sms jsonb;
  guard jsonb;
  codes_sent int;
  codes_verified int;
  completed int;
  failed_bookings int;
  reminders_failed int;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Endast personal får läsa bokningsstatusen.';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'store_name'), '[]'::jsonb) INTO per_store
  FROM (
    SELECT jsonb_build_object(
      'store_id', s.id,
      'store_name', s.name,
      'web', COUNT(o.id) FILTER (WHERE o.booked_by_staff_id IS NULL),
      'phone', COUNT(o.id) FILTER (WHERE o.booked_by_staff_id IS NOT NULL),
      'total', COUNT(o.id)
    ) AS x
    FROM public.stores s
    JOIN public.customer_orders o
      ON o.store_id = s.id
     AND o.created_at >= t_from AND o.created_at < t_to
     AND (o.phone_verified_at IS NOT NULL OR o.booked_by_staff_id IS NOT NULL)
    GROUP BY s.id, s.name
  ) q;

  SELECT jsonb_build_object(
    'sent', COUNT(*) FILTER (WHERE status = 'skickad'),
    'delivered', COUNT(*) FILTER (WHERE status = 'levererad'),
    'errors', COUNT(*) FILTER (WHERE status = 'fel'),
    'test', COUNT(*) FILTER (WHERE status = 'testlage'),
    'total', COUNT(*),
    'cost', COALESCE(SUM(cost), 0)
  ) INTO sms
  FROM public.sms_log
  WHERE created_at >= t_from AND created_at < t_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'count', c) ORDER BY c DESC), '[]'::jsonb)
    INTO guard
  FROM (
    SELECT kind, COUNT(*) AS c
    FROM public.booking_guard_events
    WHERE created_at >= t_from AND created_at < t_to
    GROUP BY kind
  ) g;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE verified_at IS NOT NULL)
    INTO codes_sent, codes_verified
  FROM public.booking_otp
  WHERE created_at >= t_from AND created_at < t_to;

  SELECT COUNT(*) INTO completed
  FROM public.customer_orders
  WHERE created_at >= t_from AND created_at < t_to
    AND phone_verified_at IS NOT NULL
    AND booked_by_staff_id IS NULL;

  SELECT COUNT(*) INTO failed_bookings
  FROM public.booking_guard_events
  WHERE created_at >= t_from AND created_at < t_to
    AND kind LIKE 'bokning_misslyckad%';

  SELECT COUNT(*) INTO reminders_failed
  FROM public.sms_log
  WHERE created_at >= t_from AND created_at < t_to
    AND type LIKE 'paminnelse%'
    AND status = 'fel';

  RETURN jsonb_build_object(
    'day', d,
    'per_store', per_store,
    'sms', sms,
    'guard', guard,
    'otp', jsonb_build_object(
      'codes_sent', codes_sent,
      'codes_verified', codes_verified,
      'completed_bookings', completed,
      'rate', CASE WHEN codes_sent > 0 THEN ROUND(completed::numeric / codes_sent, 4) ELSE NULL END
    ),
    'failed_bookings', failed_bookings,
    'reminders_failed', reminders_failed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.booking_status_day(date) TO authenticated;