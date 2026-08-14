-- Förbokning: datamodell (etapp 1)

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS booked_by_staff_id uuid;

ALTER TABLE public.customer_orders DROP CONSTRAINT IF EXISTS customer_orders_source_check;
ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_source_check
  CHECK (source = ANY (ARRAY['telefon','i_butik','epost','shopify','bokningssida']));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bookable_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_display_name text,
  ADD COLUMN IF NOT EXISTS booking_circa_price numeric,
  ADD COLUMN IF NOT EXISTS booking_step numeric,
  ADD COLUMN IF NOT EXISTS booking_lead_days integer NOT NULL DEFAULT 1;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS booking_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_closed_message text;

ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS booking_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;

-- Engångskoder. Koden lagras aldrig i klartext.
CREATE TABLE IF NOT EXISTS public.booking_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_otp_phone_idx ON public.booking_otp (phone_normalized, created_at DESC);
GRANT ALL ON public.booking_otp TO service_role;
ALTER TABLE public.booking_otp ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.booking_rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
GRANT ALL ON public.booking_rate_limits TO service_role;
ALTER TABLE public.booking_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  phone_normalized text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['otp','bekraftelse','paminnelse','paminnelse_tidig'])),
  status text NOT NULL CHECK (status = ANY (ARRAY['skickad','levererad','fel','testlage'])),
  provider_id text,
  cost numeric,
  error text,
  customer_order_id uuid REFERENCES public.customer_orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sms_log_created_idx ON public.sms_log (created_at DESC);
GRANT SELECT ON public.sms_log TO authenticated;
GRANT ALL ON public.sms_log TO service_role;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal kan läsa sms-loggen" ON public.sms_log FOR SELECT TO authenticated USING (public.is_staff());

-- Spärrhändelser (honeypot, tidsfälla, rate limit, spärrlista)
CREATE TABLE IF NOT EXISTS public.booking_guard_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  detail text,
  phone_normalized text,
  ip text
);
CREATE INDEX IF NOT EXISTS booking_guard_events_created_idx ON public.booking_guard_events (created_at DESC);
GRANT SELECT ON public.booking_guard_events TO authenticated;
GRANT ALL ON public.booking_guard_events TO service_role;
ALTER TABLE public.booking_guard_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal kan läsa spärrhändelser" ON public.booking_guard_events FOR SELECT TO authenticated USING (public.is_staff());

-- Städning av gamla engångskoder
CREATE OR REPLACE FUNCTION public.purge_booking_otp()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.booking_otp WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.booking_rate_limits WHERE window_start < now() - interval '7 days';
  RETURN n;
END;
$$;