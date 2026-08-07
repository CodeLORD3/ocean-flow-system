ALTER TABLE public.landing_settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_size integer NOT NULL DEFAULT 112,
  ADD COLUMN IF NOT EXISTS headline_font text NOT NULL DEFAULT 'heading',
  ADD COLUMN IF NOT EXISTS headline_size integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS headline_weight integer NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS headline_color text NOT NULL DEFAULT 'foreground',
  ADD COLUMN IF NOT EXISTS subheadline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS card_title text NOT NULL DEFAULT 'Logga in',
  ADD COLUMN IF NOT EXISTS card_subtitle text NOT NULL DEFAULT 'Använd din arbets-e-post för att komma åt portalerna.';