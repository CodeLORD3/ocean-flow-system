UPDATE public.customers_retail
SET first_name = NULL,
    last_name = NULL,
    name_review_needed = true
WHERE is_company = true
  AND anonymized_at IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL)
  AND lower(coalesce(btrim(first_name), '') || ' ' || coalesce(btrim(last_name), '')) = lower(btrim(coalesce(company_name, '')));