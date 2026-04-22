
COMMENT ON TABLE public.companies IS 'TODO: consider renaming to portfolio_companies for clarity with legal_entities. Used by investor portal only — do NOT reuse for POS legal entities.';

CREATE TABLE public.legal_entities (
  legal_entity_id      text PRIMARY KEY,
  legal_name           text NOT NULL,
  org_nr               text NOT NULL,
  country              text NOT NULL,
  currency             text NOT NULL,
  locale               text NOT NULL DEFAULT 'sv-SE',
  vat_registration     text,
  accounting_provider  text,
  accounting_config    jsonb NOT NULL DEFAULT '{}'::jsonb,
  fortnox_access_token text,
  fortnox_refresh_token text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read legal_entities"
  ON public.legal_entities FOR SELECT USING (true);

CREATE POLICY "Public manage legal_entities"
  ON public.legal_entities FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.legal_entities (legal_entity_id, legal_name, org_nr, country, currency, locale, vat_registration, accounting_provider) VALUES
  ('fsab-se', 'Fisk & Skaldjursspecialisten AB', '556XXX-XXXX', 'SE', 'SEK', 'sv-SE', 'SE556XXXXXXXXX01', 'fortnox_manual'),
  ('de-no1',  'DE No.1 AB',                     '559XXX-XXXX', 'SE', 'SEK', 'sv-SE', 'SE559XXXXXXXXX01', 'fortnox_manual'),
  ('fsab-ch', 'Fisk & Skaldjur Zollikon AG',    'CHE-XXX.XXX.XXX', 'CH', 'CHF', 'de-CH', 'CHE-XXX.XXX.XXX MWST', 'manual');

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id),
  ADD COLUMN IF NOT EXISTS country         text,
  ADD COLUMN IF NOT EXISTS currency        text,
  ADD COLUMN IF NOT EXISTS locale          text,
  ADD COLUMN IF NOT EXISTS region          text,
  ADD COLUMN IF NOT EXISTS slug            text,
  ADD COLUMN IF NOT EXISTS active          boolean NOT NULL DEFAULT true;

UPDATE public.stores
SET name = 'Fisk & Skaldjur Ålsten', city = COALESCE(city, 'Stockholm'),
    slug = 'alsten', legal_entity_id = 'de-no1',
    country = 'SE', currency = 'SEK', locale = 'sv-SE', region = 'stockholm'
WHERE id = 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7';

UPDATE public.stores
SET name = 'Fisk & Skaldjur Kungsholmen', city = COALESCE(city, 'Stockholm'),
    slug = 'kungsholmen', legal_entity_id = 'de-no1',
    country = 'SE', currency = 'SEK', locale = 'sv-SE', region = 'stockholm'
WHERE id = 'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7';

UPDATE public.stores
SET name = 'Fisk & Skaldjur Amhult', city = COALESCE(city, 'Göteborg'),
    slug = 'amhult', legal_entity_id = 'fsab-se',
    country = 'SE', currency = 'SEK', locale = 'sv-SE', region = 'vast'
WHERE id = '1426d0bb-dd09-46be-9d11-bc96d203eede';

UPDATE public.stores
SET name = 'Fisk & Skaldjur Särö Centrum', city = COALESCE(city, 'Särö'),
    slug = 'saro', legal_entity_id = 'fsab-se',
    country = 'SE', currency = 'SEK', locale = 'sv-SE', region = 'vast'
WHERE id = '9ca4f9de-5a14-4bdf-90e7-b22246d41f55';

UPDATE public.stores
SET name = 'Fisk & Skaldjur Zollikon', city = COALESCE(city, 'Zollikon'),
    slug = 'zollikon', legal_entity_id = 'fsab-ch',
    country = 'CH', currency = 'CHF', locale = 'de-CH', region = 'schweiz'
WHERE id = '93adfded-5d68-41e3-9b00-c3b3db4f5ee4';

INSERT INTO public.stores (name, city, slug, legal_entity_id, country, currency, locale, region, active)
SELECT 'Fisk & Skaldjur Torslanda Torg', 'Göteborg', 'torslanda', 'fsab-se', 'SE', 'SEK', 'sv-SE', 'vast', true
WHERE NOT EXISTS (SELECT 1 FROM public.stores WHERE slug = 'torslanda');

UPDATE public.stores SET slug = 'store-' || substring(id::text, 1, 8) WHERE slug IS NULL;
UPDATE public.stores SET legal_entity_id = 'fsab-se' WHERE legal_entity_id IS NULL;
UPDATE public.stores SET country = 'SE' WHERE country IS NULL;
UPDATE public.stores SET currency = 'SEK' WHERE currency IS NULL;
UPDATE public.stores SET locale = 'sv-SE' WHERE locale IS NULL;

ALTER TABLE public.stores
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN legal_entity_id SET NOT NULL,
  ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN locale SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_unique ON public.stores(slug);

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id);

UPDATE public.pos_transactions t
SET legal_entity_id = s.legal_entity_id
FROM public.stores s
WHERE t.store_id = s.id AND t.legal_entity_id IS NULL;

CREATE OR REPLACE FUNCTION public.pos_tx_set_legal_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.legal_entity_id IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT legal_entity_id INTO NEW.legal_entity_id
    FROM public.stores WHERE id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_tx_set_legal_entity ON public.pos_transactions;
CREATE TRIGGER trg_pos_tx_set_legal_entity
  BEFORE INSERT ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_tx_set_legal_entity();

CREATE OR REPLACE FUNCTION public.prevent_legal_entity_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id THEN
    RAISE EXCEPTION 'legal_entity_id på transaktion är immutable (bokföringslagen)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_tx_legal_entity_immutable ON public.pos_transactions;
CREATE TRIGGER trg_pos_tx_legal_entity_immutable
  BEFORE UPDATE ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_entity_change();

ALTER TABLE public.scomber_pricing_rules
  ADD COLUMN IF NOT EXISTS round_to_ore integer NOT NULL DEFAULT 100;

DROP TABLE IF EXISTS public.b2b_order_lines CASCADE;
DROP TABLE IF EXISTS public.b2b_orders CASCADE;
DROP TABLE IF EXISTS public.scomber_customer_tiers CASCADE;
