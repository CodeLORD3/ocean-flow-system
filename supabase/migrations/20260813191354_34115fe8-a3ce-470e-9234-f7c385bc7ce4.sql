-- 1. Normaliseringsfunktioner
CREATE OR REPLACE FUNCTION public.normalize_phone_se(v text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(v, '[^0-9+]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d,2) = '00' THEN d := '+' || substr(d,3); END IF;
  IF left(d,1) <> '+' THEN
    IF left(d,2) = '46' THEN d := '+' || d;
    ELSIF left(d,1) = '0' THEN d := '+46' || substr(d,2);
    ELSE d := '+46' || d;
    END IF;
  END IF;
  d := '+' || regexp_replace(substr(d,2), '[^0-9]', '', 'g');
  IF length(d) < 8 THEN RETURN NULL; END IF;
  RETURN d;
END; $$;

CREATE OR REPLACE FUNCTION public.normalize_email(v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(lower(btrim(v)), '')
$$;

CREATE OR REPLACE FUNCTION public.last_name_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(lower(btrim(regexp_replace(coalesce(v,''), '^.*\s', ''))), '')
$$;

-- 2. Kundregistret
ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS shopify_customer_id text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS email_normalized text,
  ADD COLUMN IF NOT EXISTS legal_entity_id text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE OR REPLACE FUNCTION public.customers_retail_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.phone_normalized := public.normalize_phone_se(NEW.phone);
  NEW.email_normalized := public.normalize_email(NEW.email);
  IF NEW.legal_entity_id IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT s.legal_entity_id INTO NEW.legal_entity_id FROM public.stores s WHERE s.id = NEW.store_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customers_retail_normalize ON public.customers_retail;
CREATE TRIGGER trg_customers_retail_normalize
BEFORE INSERT OR UPDATE ON public.customers_retail
FOR EACH ROW EXECUTE FUNCTION public.customers_retail_normalize();

UPDATE public.customers_retail c
SET phone_normalized = public.normalize_phone_se(c.phone),
    email_normalized = public.normalize_email(c.email),
    legal_entity_id = COALESCE(c.legal_entity_id, (SELECT s.legal_entity_id FROM public.stores s WHERE s.id = c.store_id));

CREATE INDEX IF NOT EXISTS customers_retail_shopify_customer_idx
  ON public.customers_retail (shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_retail_entity_email_idx
  ON public.customers_retail (legal_entity_id, email_normalized);
CREATE INDEX IF NOT EXISTS customers_retail_entity_phone_idx
  ON public.customers_retail (legal_entity_id, phone_normalized);

-- 3. Avbokningsfält på kundordern
ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_source text,
  ADD COLUMN IF NOT EXISTS cancelled_was_packed boolean NOT NULL DEFAULT false;

-- 4. Webhookkön: nya statusar för avbokning
ALTER TABLE public.shopify_webhook_events DROP CONSTRAINT IF EXISTS shopify_webhook_events_status_check;
ALTER TABLE public.shopify_webhook_events ADD CONSTRAINT shopify_webhook_events_status_check
  CHECK (status = ANY (ARRAY['koad','bearbetar','mottagen','skapad','osorterad','ogiltig_hmac','fel','duplikat','avbokad','avbokad_larm','okand_topic']));

CREATE INDEX IF NOT EXISTS shopify_webhook_events_order_topic_idx
  ON public.shopify_webhook_events (shopify_order_id, topic);

-- 5. Dubblettkandidater (endast läsning, ingen automatisk sammanslagning)
CREATE OR REPLACE VIEW public.retail_customer_duplicates
WITH (security_invoker = true) AS
SELECT a.id AS customer_a, a.name AS name_a, a.email AS email_a, a.phone AS phone_a,
       b.id AS customer_b, b.name AS name_b, b.email AS email_b, b.phone AS phone_b,
       a.legal_entity_id,
       CASE WHEN a.email_normalized IS NOT NULL AND a.email_normalized = b.email_normalized
            THEN 'samma e-post' ELSE 'samma telefon + efternamn' END AS match_reason
FROM public.customers_retail a
JOIN public.customers_retail b
  ON b.id > a.id
 AND coalesce(a.legal_entity_id,'-') = coalesce(b.legal_entity_id,'-')
 AND a.anonymized_at IS NULL AND b.anonymized_at IS NULL
 AND (
      (a.email_normalized IS NOT NULL AND a.email_normalized = b.email_normalized)
   OR (a.phone_normalized IS NOT NULL AND a.phone_normalized = b.phone_normalized
       AND public.last_name_key(a.name) IS NOT NULL
       AND public.last_name_key(a.name) = public.last_name_key(b.name))
 );

GRANT SELECT ON public.retail_customer_duplicates TO authenticated;
GRANT ALL ON public.retail_customer_duplicates TO service_role;