
-- 1. Recreate the handle_new_investor trigger (function already exists, ensure trigger is attached)
DROP TRIGGER IF EXISTS on_auth_user_created_investor ON auth.users;
CREATE TRIGGER on_auth_user_created_investor
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_investor();

-- 2. Add payment_reference column to pledges
ALTER TABLE public.pledges ADD COLUMN IF NOT EXISTS payment_reference text UNIQUE;

-- Create function to auto-generate payment_reference on insert
CREATE OR REPLACE FUNCTION public.generate_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.payment_reference := 'OT-' || EXTRACT(YEAR FROM now())::text || '-' || LEFT(NEW.user_id::text, 6) || '-' || LEFT(NEW.offer_id::text, 6);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_payment_reference ON public.pledges;
CREATE TRIGGER trg_generate_payment_reference
  BEFORE INSERT ON public.pledges
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_payment_reference();

-- 3. Create payment_events table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id uuid REFERENCES public.pledges(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  admin_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payment_events"
  ON public.payment_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Investors can read own payment_events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pledges p WHERE p.id = payment_events.pledge_id AND p.user_id = auth.uid()
    )
  );

-- 4. Add suitability_passed to investor_profiles
ALTER TABLE public.investor_profiles ADD COLUMN IF NOT EXISTS suitability_passed boolean NOT NULL DEFAULT false;

-- Create suitability_responses table
CREATE TABLE IF NOT EXISTS public.suitability_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_18_plus boolean NOT NULL DEFAULT false,
  is_not_us_person boolean NOT NULL DEFAULT false,
  understands_risk boolean NOT NULL DEFAULT false,
  understands_no_deposit_guarantee boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suitability_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own suitability"
  ON public.suitability_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own suitability"
  ON public.suitability_responses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all suitability"
  ON public.suitability_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Add published_by and published_at to trade_offers (payment_reference_prefix already exists)
ALTER TABLE public.trade_offers ADD COLUMN IF NOT EXISTS published_by uuid;
ALTER TABLE public.trade_offers ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 6. Fix notifications RLS - replace the overly broad policy with proper ones
DROP POLICY IF EXISTS "Public access" ON public.notifications;

CREATE POLICY "Anyone can insert notifications"
  ON public.notifications FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Public can read non-user notifications"
  ON public.notifications FOR SELECT TO public
  USING (user_id IS NULL);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Create offer_documents table
CREATE TABLE IF NOT EXISTS public.offer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.trade_offers(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true
);

ALTER TABLE public.offer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read offer_documents"
  ON public.offer_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage offer_documents"
  ON public.offer_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Migrate existing document_url from trade_offers into offer_documents
INSERT INTO public.offer_documents (offer_id, file_name, file_url)
SELECT id, COALESCE(SPLIT_PART(document_url, '/', -1), 'document.pdf'), document_url
FROM public.trade_offers
WHERE document_url IS NOT NULL AND document_url != ''
ON CONFLICT DO NOTHING;
