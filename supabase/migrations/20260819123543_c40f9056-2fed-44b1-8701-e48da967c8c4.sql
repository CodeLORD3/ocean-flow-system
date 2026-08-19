CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref text NOT NULL UNIQUE,
  verification_ref uuid,
  store_id uuid REFERENCES public.stores(id),
  phone text,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'CREATED',
  error_code text,
  date_paid timestamptz,
  callback_identifier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plattformsadmin kan läsa betalningar"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE INDEX payments_status_idx ON public.payments (status, created_at DESC);
CREATE INDEX payments_verification_idx ON public.payments (verification_ref);

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();