ALTER TABLE public.pk_costgroups
  ADD COLUMN IF NOT EXISTS is_company_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_confidence text;

UPDATE public.pk_costgroups
SET match_confidence = CASE
  WHEN store_id_manual THEN 'manual'
  WHEN store_id IS NOT NULL THEN 'sure'
  ELSE 'none'
END
WHERE match_confidence IS NULL;