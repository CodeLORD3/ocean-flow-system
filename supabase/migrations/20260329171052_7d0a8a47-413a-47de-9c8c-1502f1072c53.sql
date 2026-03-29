CREATE TABLE public.contact_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  address text,
  opening_hours text,
  additional_info text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read contact_settings" ON public.contact_settings FOR SELECT TO public USING (true);
CREATE POLICY "Public write contact_settings" ON public.contact_settings FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO public.contact_settings (email, phone, address, opening_hours, additional_info)
VALUES ('info@oceantrade.com', '+46 31 123 45 67', 'Göteborg, Sweden', 'Mon–Fri: 09:00 – 17:00', 'For urgent matters, please call during opening hours.');