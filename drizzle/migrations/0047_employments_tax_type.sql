ALTER TABLE public.employments ADD COLUMN IF NOT EXISTS tax_type text;
ALTER TABLE public.employments DROP CONSTRAINT IF EXISTS employments_tax_type_check;
ALTER TABLE public.employments ADD CONSTRAINT employments_tax_type_check CHECK (tax_type IS NULL OR tax_type IN ('HUV','EXT','STU','TMP','EJ'));
COMMENT ON COLUMN public.employments.tax_type IS 'Skattetyp enligt Fortnox Lön (TaxAllowance): HUV huvudinkomst (tabell/kolumn), EXT sidoinkomst 30 %, STU studerande, TMP kortvarigt anställd, EJ ingen skatt.';