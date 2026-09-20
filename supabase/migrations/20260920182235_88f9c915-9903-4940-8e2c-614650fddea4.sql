ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS auction_status text,
  ADD COLUMN IF NOT EXISTS auction_destination text,
  ADD COLUMN IF NOT EXISTS colli_count integer,
  ADD COLUMN IF NOT EXISTS nominal_weight_per_colli numeric,
  ADD COLUMN IF NOT EXISTS box_photo_url text,
  ADD COLUMN IF NOT EXISTS auction_lot_number text,
  ADD COLUMN IF NOT EXISTS ring_reference text,
  ADD COLUMN IF NOT EXISTS field_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS final_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS cost_pending_settlement boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.auction_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Stockholm')::date,
  location_id uuid REFERENCES public.storage_locations(id),
  lot_id uuid REFERENCES public.lots(id),
  movement_id uuid REFERENCES public.stock_movements(id),
  price_per_kg numeric NOT NULL,
  colli integer NOT NULL DEFAULT 1,
  box_photo_url text,
  status text NOT NULL DEFAULT 'preliminart',
  destination text,
  suggestions jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggestions_confirmed_at timestamp with time zone,
  suggestions_confirmed_by uuid,
  client_key text NOT NULL,
  note text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT auction_purchases_client_key_unique UNIQUE (client_key),
  CONSTRAINT auction_purchases_price_positive CHECK (price_per_kg > 0),
  CONSTRAINT auction_purchases_colli_positive CHECK (colli >= 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_purchases TO authenticated;
GRANT ALL ON public.auction_purchases TO service_role;

ALTER TABLE public.auction_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan se auktionsinkop"
  ON public.auction_purchases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Personal kan registrera auktionsinkop"
  ON public.auction_purchases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Personal kan andra auktionsinkop"
  ON public.auction_purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS auction_purchases_date_idx ON public.auction_purchases (purchase_date DESC);

CREATE TRIGGER auction_purchases_touch
  BEFORE UPDATE ON public.auction_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();