ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS name_review_needed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customers_retail.name IS 'Originaldata: fritt namnfält. Skrivs aldrig över av migreringar.';
COMMENT ON COLUMN public.customers_retail.first_name IS 'Förnamn. För organisationer avser fältet kontaktpersonen och är valfritt.';
COMMENT ON COLUMN public.customers_retail.last_name IS 'Efternamn. Används i matchning telefon + efternamn.';
COMMENT ON COLUMN public.customers_retail.name_review_needed IS 'Namnet kunde inte delas säkert vid migreringen och behöver manuell genomgång.';

-- Osäkra fall markeras för genomgång, ingen gissning görs.
UPDATE public.customers_retail
SET name_review_needed = true
WHERE anonymized_at IS NULL
  AND (
    coalesce(btrim(name), '') = ''
    OR btrim(name) !~ '\s'
    OR name ~ '[()0-9]'
    OR lower(name) ~ '(klubb|förening|forening|\mab\M|club)'
  );

-- Säkra fall: dela på sista mellanslaget. Originalnamnet lämnas orört.
UPDATE public.customers_retail
SET first_name = btrim(regexp_replace(btrim(name), '\s+\S+$', '')),
    last_name  = btrim(regexp_replace(btrim(name), '^.*\s+', ''))
WHERE anonymized_at IS NULL
  AND name_review_needed = false
  AND coalesce(btrim(first_name), '') = ''
  AND coalesce(btrim(last_name), '') = '';

-- Organisationer: fyll organisationsnamnet från originalnamnet om det saknas.
UPDATE public.customers_retail
SET company_name = btrim(name)
WHERE is_company = true
  AND coalesce(btrim(company_name), '') = ''
  AND coalesce(btrim(name), '') <> '';

-- Dubblettöversikten: efternamnsfältet först, gamla namnets sista ord som reserv.
CREATE OR REPLACE FUNCTION public.last_name_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(btrim(regexp_replace(btrim(coalesce(v, '')), '^.*\s+', ''))), '')
$$;

DROP VIEW IF EXISTS public.retail_customer_duplicates;

CREATE VIEW public.retail_customer_duplicates AS
WITH c AS (
  SELECT id,
         name,
         phone,
         email,
         email_normalized,
         phone_normalized,
         legal_entity_id,
         coalesce(public.last_name_key(last_name), public.last_name_key(name)) AS lname
  FROM public.customers_retail
  WHERE anonymized_at IS NULL
)
SELECT a.id AS customer_a,
       b.id AS customer_b,
       a.name AS name_a,
       b.name AS name_b,
       a.phone AS phone_a,
       b.phone AS phone_b,
       a.email AS email_a,
       b.email AS email_b,
       'Samma e-post'::text AS match_reason
FROM c a
JOIN c b
  ON b.id > a.id
 AND a.email_normalized IS NOT NULL
 AND a.email_normalized = b.email_normalized
 AND coalesce(a.legal_entity_id, '') = coalesce(b.legal_entity_id, '')
UNION ALL
SELECT a.id, b.id, a.name, b.name, a.phone, b.phone, a.email, b.email,
       'Samma telefon och efternamn'::text
FROM c a
JOIN c b
  ON b.id > a.id
 AND a.phone_normalized IS NOT NULL
 AND a.phone_normalized = b.phone_normalized
 AND a.lname IS NOT NULL
 AND a.lname = b.lname
 AND coalesce(a.legal_entity_id, '') = coalesce(b.legal_entity_id, '');

GRANT SELECT ON public.retail_customer_duplicates TO authenticated;
GRANT SELECT ON public.retail_customer_duplicates TO service_role;