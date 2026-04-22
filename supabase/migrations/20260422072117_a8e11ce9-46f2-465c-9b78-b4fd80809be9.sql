-- Add user_id to staff (linking auth.users) and portal access columns
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_access text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

-- Landing page settings (single row)
CREATE TABLE IF NOT EXISTS public.landing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL DEFAULT 'Välkommen till Makrill Trade',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read landing_settings"
  ON public.landing_settings FOR SELECT
  USING (true);

CREATE POLICY "Public write landing_settings"
  ON public.landing_settings FOR ALL
  USING (true) WITH CHECK (true);

INSERT INTO public.landing_settings (headline)
SELECT 'Välkommen till Makrill Trade'
WHERE NOT EXISTS (SELECT 1 FROM public.landing_settings);

-- Helper function to fetch the staff record for the current auth user
CREATE OR REPLACE FUNCTION public.current_staff()
RETURNS public.staff
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.staff WHERE user_id = auth.uid() LIMIT 1
$$;