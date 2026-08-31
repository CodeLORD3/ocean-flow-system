-- Inställningar för behovsavstämningen (en rad används)
CREATE TABLE public.purchase_reconciliation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surplus_warn_pct numeric NOT NULL DEFAULT 50,
  average_weeks integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.purchase_reconciliation_settings TO authenticated;
GRANT ALL ON public.purchase_reconciliation_settings TO service_role;

ALTER TABLE public.purchase_reconciliation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal laser avstamningsinstallningar"
  ON public.purchase_reconciliation_settings
  FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Admin hanterar avstamningsinstallningar"
  ON public.purchase_reconciliation_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER purchase_reconciliation_settings_updated
  BEFORE UPDATE ON public.purchase_reconciliation_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.purchase_reconciliation_settings (surplus_warn_pct, average_weeks)
VALUES (50, 4);

-- Manuellt bekräftade kopplingar mellan kundradens varunamn och inköpssidans produkt
CREATE TABLE public.customer_product_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_key text NOT NULL UNIQUE,
  source_name text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  confirmed_by uuid,
  confirmed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_product_matches_product_idx
  ON public.customer_product_matches(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_product_matches TO authenticated;
GRANT ALL ON public.customer_product_matches TO service_role;

ALTER TABLE public.customer_product_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal hanterar produktkopplingar"
  ON public.customer_product_matches
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE TRIGGER customer_product_matches_updated
  BEFORE UPDATE ON public.customer_product_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();