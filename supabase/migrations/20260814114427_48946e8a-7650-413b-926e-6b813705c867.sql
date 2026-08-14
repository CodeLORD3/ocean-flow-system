-- 1. Informationsgräns för bokad volym per vara och hämtdag (standard av = NULL)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS booking_volume_alarm numeric;

-- 2. Bokad volym per vara och hämtdag, med informationslarm
CREATE OR REPLACE FUNCTION public.booking_volume_by_day(_from date DEFAULT NULL, _days integer DEFAULT 14)
RETURNS TABLE(
  wanted_date date,
  product_id uuid,
  product_name text,
  unit text,
  total numeric,
  threshold numeric,
  over_threshold boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.wanted_date,
    l.product_id,
    COALESCE(p.booking_display_name, p.name, 'Fritextrad') AS product_name,
    COALESCE(l.unit, p.unit, 'kg') AS unit,
    SUM(l.quantity_ordered)::numeric AS total,
    p.booking_volume_alarm AS threshold,
    (p.booking_volume_alarm IS NOT NULL AND SUM(l.quantity_ordered) > p.booking_volume_alarm) AS over_threshold
  FROM public.customer_order_lines l
  JOIN public.customer_orders o ON o.id = l.customer_order_id
  LEFT JOIN public.products p ON p.id = l.product_id
  WHERE public.is_staff()
    AND o.source = 'bokningssida'
    AND o.status <> 'avbruten'
    AND l.pack_status <> 'struken'
    AND o.wanted_date >= COALESCE(_from, (now() AT TIME ZONE 'Europe/Stockholm')::date)
    AND o.wanted_date < COALESCE(_from, (now() AT TIME ZONE 'Europe/Stockholm')::date) + GREATEST(COALESCE(_days, 14), 1)
  GROUP BY o.wanted_date, l.product_id, p.booking_display_name, p.name, l.unit, p.unit, p.booking_volume_alarm
  ORDER BY o.wanted_date, product_name
$$;

GRANT EXECUTE ON FUNCTION public.booking_volume_by_day(date, integer) TO authenticated;

-- 3. Systemstatus: samma siffror som förut, plus volymlarmen
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
  volume_alarms jsonb;
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

  -- Informationslarm: bokad volym över tröskeln. Blockerar aldrig någon bokning.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'wanted_date', v.wanted_date,
           'product_id', v.product_id,
           'product_name', v.product_name,
           'unit', v.unit,
           'total', v.total,
           'threshold', v.threshold
         ) ORDER BY v.wanted_date, v.product_name), '[]'::jsonb)
    INTO volume_alarms
  FROM public.booking_volume_by_day(d, 14) v
  WHERE v.over_threshold;

  RETURN jsonb_build_object(
    'day', d,
    'per_store', per_store,
    'sms', sms,
    'guard', guard,
    'volume_alarms', volume_alarms,
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

-- 4. GDPR: telefonnummer ur sms_log efter 12 månader, kostnad och statistik behålls
CREATE OR REPLACE FUNCTION public.purge_sms_log_phones()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.sms_log
     SET phone_normalized = NULL
   WHERE phone_normalized IS NOT NULL
     AND created_at < now() - interval '12 months';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_sms_log_phones() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_sms_log_phones() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('gdpr-gallring-sms-log')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-gallring-sms-log');
    PERFORM cron.schedule('gdpr-gallring-sms-log', '30 3 * * *', 'SELECT public.purge_sms_log_phones();');
  END IF;
END
$$;

-- 5. GDPR: manuell radering på begäran, orderhistoriken behålls avidentifierad
CREATE OR REPLACE FUNCTION public.anonymize_retail_customer(_customer_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orders_touched integer := 0;
  sms_touched integer := 0;
  cust record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Bara admin får radera kunduppgifter.';
  END IF;

  SELECT * INTO cust FROM public.customers_retail WHERE id = _customer_id;
  IF cust.id IS NULL THEN
    RAISE EXCEPTION 'Kunden finns inte.';
  END IF;

  UPDATE public.sms_log s
     SET phone_normalized = NULL
   WHERE s.customer_order_id IN (SELECT id FROM public.customer_orders WHERE customer_id = _customer_id);
  GET DIAGNOSTICS sms_touched = ROW_COUNT;

  UPDATE public.customer_orders
     SET customer_name_snapshot = 'Raderad kund',
         customer_phone_snapshot = NULL,
         customer_email_snapshot = NULL
   WHERE customer_id = _customer_id;
  GET DIAGNOSTICS orders_touched = ROW_COUNT;

  UPDATE public.customers_retail
     SET name = 'Raderad kund',
         first_name = NULL,
         last_name = NULL,
         phone = NULL,
         phone_normalized = NULL,
         email = NULL,
         email_normalized = NULL,
         street = NULL,
         postal_code = NULL,
         note = NULLIF(TRIM(COALESCE('Raderad på begäran. ' || COALESCE(_reason, ''), '')), ''),
         contact_reference = NULL,
         shopify_customer_id = NULL,
         anonymized_at = now()
   WHERE id = _customer_id;

  INSERT INTO public.activity_logs (portal, action_type, description, entity_type, entity_id, store_id, details)
  VALUES ('admin', 'delete', 'Kunduppgifter raderade på begäran (GDPR)', 'customers_retail', _customer_id::text, cust.store_id,
          jsonb_build_object('reason', _reason, 'orders_anonymized', orders_touched, 'sms_rows_cleared', sms_touched));

  RETURN jsonb_build_object('ok', true, 'orders_anonymized', orders_touched, 'sms_rows_cleared', sms_touched);
END;
$$;

GRANT EXECUTE ON FUNCTION public.anonymize_retail_customer(uuid, text) TO authenticated;