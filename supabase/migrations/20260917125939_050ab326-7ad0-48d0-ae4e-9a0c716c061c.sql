CREATE TABLE public.payment_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  card_brand text,
  card_last4 text NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  card_holder text,
  label text,
  card_kind text NOT NULL DEFAULT 'foretag' CHECK (card_kind IN ('foretag','privat')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_cards_last4_kind_idx ON public.payment_cards (card_last4, card_kind, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_cards TO authenticated;
GRANT ALL ON public.payment_cards TO service_role;

ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan se kort" ON public.payment_cards
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Personal kan hantera kort" ON public.payment_cards
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER payment_cards_updated_at BEFORE UPDATE ON public.payment_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.important_papers
  ADD COLUMN card_id uuid REFERENCES public.payment_cards(id) ON DELETE SET NULL,
  ADD COLUMN paid_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN is_expense_claim boolean NOT NULL DEFAULT false;
