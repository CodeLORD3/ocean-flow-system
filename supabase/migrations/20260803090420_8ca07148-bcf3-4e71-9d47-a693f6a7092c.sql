-- 1. YIELDS
CREATE TABLE public.yields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_group text NOT NULL,
  from_form text NOT NULL,
  to_form text NOT NULL,
  yield_pct numeric NOT NULL CHECK (yield_pct > 0 AND yield_pct <= 100),
  is_estimate boolean NOT NULL DEFAULT true,
  note text,
  calibrated_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (species_group, from_form, to_form)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yields TO authenticated;
GRANT ALL ON public.yields TO service_role;
ALTER TABLE public.yields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage yields" ON public.yields FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. CUT SPLITS
CREATE TABLE public.cut_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_group text NOT NULL,
  detail_form text NOT NULL,
  pct_of_fillet numeric NOT NULL CHECK (pct_of_fillet > 0 AND pct_of_fillet <= 100),
  margin_weight numeric NOT NULL DEFAULT 1,
  is_optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (species_group, detail_form)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cut_splits TO authenticated;
GRANT ALL ON public.cut_splits TO service_role;
ALTER TABLE public.cut_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage cut_splits" ON public.cut_splits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. PRODUCTION ORDERS
CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  production_date date NOT NULL DEFAULT current_date,
  created_by text,
  species_group text,
  raw_product_id uuid REFERENCES public.products(id),
  raw_sku text,
  raw_name text NOT NULL,
  raw_form text NOT NULL DEFAULT 'hel',
  raw_quantity numeric NOT NULL,
  raw_unit text NOT NULL DEFAULT 'kg',
  purchase_price_per_kg numeric NOT NULL DEFAULT 0,
  supplier_name text,
  batch_number text,
  purchase_report_line_id uuid,
  store_id uuid REFERENCES public.stores(id),
  waste_pct numeric NOT NULL DEFAULT 0,
  actual_waste_pct numeric,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage production_orders" ON public.production_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.production_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  detail_name text NOT NULL,
  detail_form text NOT NULL,
  planned_pct numeric NOT NULL DEFAULT 0,
  planned_qty numeric NOT NULL DEFAULT 0,
  actual_qty numeric,
  cost_price numeric NOT NULL DEFAULT 0,
  margin_weight numeric NOT NULL DEFAULT 1,
  is_processed boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_lines TO authenticated;
GRANT ALL ON public.production_order_lines TO service_role;
ALTER TABLE public.production_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage production_order_lines" ON public.production_order_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. YIELD ACTUALS
CREATE TABLE public.yield_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.production_orders(id) ON DELETE CASCADE,
  species_group text NOT NULL,
  from_form text NOT NULL,
  to_form text NOT NULL,
  quantity_in numeric NOT NULL,
  quantity_out numeric NOT NULL,
  actual_pct numeric NOT NULL,
  standard_pct numeric,
  deviation_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yield_actuals TO authenticated;
GRANT ALL ON public.yield_actuals TO service_role;
ALTER TABLE public.yield_actuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage yield_actuals" ON public.yield_actuals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. SETTINGS
CREATE TABLE public.processing_surcharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  surcharge_per_kg numeric NOT NULL DEFAULT 35,
  applies boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_surcharges TO authenticated;
GRANT ALL ON public.processing_surcharges TO service_role;
ALTER TABLE public.processing_surcharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage processing_surcharges" ON public.processing_surcharges FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.margin_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  label text,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  target_pct numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX margin_targets_region_uniq ON public.margin_targets (region) WHERE store_id IS NULL;
CREATE UNIQUE INDEX margin_targets_store_uniq ON public.margin_targets (store_id) WHERE store_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.margin_targets TO authenticated;
GRANT ALL ON public.margin_targets TO service_role;
ALTER TABLE public.margin_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage margin_targets" ON public.margin_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.vat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  rate numeric NOT NULL,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_rates TO authenticated;
GRANT ALL ON public.vat_rates TO service_role;
ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage vat_rates" ON public.vat_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER trg_yields_updated BEFORE UPDATE ON public.yields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cut_splits_updated BEFORE UPDATE ON public.cut_splits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prod_orders_updated BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_prod_lines_updated BEFORE UPDATE ON public.production_order_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_surcharges_updated BEFORE UPDATE ON public.processing_surcharges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_margin_updated BEFORE UPDATE ON public.margin_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_vat_updated BEFORE UPDATE ON public.vat_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEED: yields
INSERT INTO public.yields (species_group, from_form, to_form, yield_pct, is_estimate, note) VALUES
('torsk','hel','filé med skinn',47,false,'Husets uppmätta värde'),
('torsk','hel','filé utan skinn',40,false,'Husets uppmätta värde'),
('kolja','hel','filé med skinn',45,false,'Husets uppmätta värde'),
('kolja','hel','filé utan skinn',39,false,'Husets uppmätta värde'),
('sej','hel','filé med skinn',44,false,'Husets uppmätta värde'),
('sej','hel','filé utan skinn',38,false,'Husets uppmätta värde'),
('marulk','hel','rensad stjärt',20,false,'Husets uppmätta värde'),
('marulk','rensad stjärt','filé utan skinn',65,false,'Husets uppmätta värde'),
('havskräfta','hel','säljbar',90,false,'Bortsortering, ej kokförlust'),
('kummel','hel','filé utan skinn',41,true,'Branschvärde'),
('långa','hel','filé utan skinn',42,true,'Branschvärde'),
('kolfisk','hel','filé utan skinn',44,true,'Branschvärde'),
('bleka','hel','filé utan skinn',42,true,'Branschvärde'),
('lubb','hel','filé utan skinn',40,true,'Branschvärde'),
('vitling','hel','filé utan skinn',38,true,'Branschvärde'),
('havskatt','hel','filé utan skinn',45,true,'Branschvärde'),
('kungsfisk','hel','filé utan skinn',38,true,'Branschvärde'),
('lake','hel','filé utan skinn',40,true,'Branschvärde'),
('kapkummel','hel','filé utan skinn',40,true,'Branschvärde'),
('knot','hel','filé utan skinn',35,true,'Branschvärde'),
('fjärsing','hel','filé utan skinn',35,true,'Branschvärde'),
('mullus','hel','filé utan skinn',40,true,'Branschvärde'),
('silversida','hel','filé utan skinn',40,true,'Branschvärde'),
('red-snapper','hel','filé utan skinn',42,true,'Branschvärde'),
('papegojfisk','hel','filé utan skinn',40,true,'Branschvärde'),
('beryx','hel','filé utan skinn',42,true,'Branschvärde'),
('taggmakrill','hel','filé utan skinn',45,true,'Branschvärde'),
('stillahavskungsfisk','hel','filé utan skinn',38,true,'Branschvärde'),
('gös','hel','filé utan skinn',42,true,'Insjöfisk, branschvärde'),
('abborre','hel','filé utan skinn',38,true,'Insjöfisk, branschvärde'),
('gädda','hel','filé utan skinn',40,true,'Insjöfisk, branschvärde'),
('sik','hel','filé utan skinn',45,true,'Insjöfisk, branschvärde'),
('rödspätta','hel','filé utan skinn',45,true,'Plattfisk, branschvärde'),
('sjötunga','hel','filé utan skinn',45,true,'Plattfisk, branschvärde'),
('bergtunga','hel','filé utan skinn',45,true,'Plattfisk, branschvärde'),
('rödtunga','hel','filé utan skinn',42,true,'Plattfisk, branschvärde'),
('piggvar','hel','filé utan skinn',45,true,'Plattfisk, branschvärde'),
('slätvar','hel','filé utan skinn',45,true,'Plattfisk, branschvärde'),
('sillflundra','hel','filé utan skinn',42,true,'Plattfisk, branschvärde'),
('hälleflundra','urtagen utan huvud','filé utan skinn',65,true,'Plattfisk, branschvärde'),
('blåkveite','urtagen utan huvud','filé utan skinn',60,true,'Plattfisk, branschvärde'),
('lax','hel','sida med skinn',60,false,'Husets värde'),
('lax','sida med skinn','filé utan skinn',85,false,'Husets värde'),
('lax','hel','färs',12,false,'Husets värde'),
('lax','hel','ben',15,false,'Husets värde'),
('lax','hel','huvud',10,false,'Husets värde'),
('regnbåge','hel','sida med skinn',58,true,'Laxfisk, branschvärde'),
('havsöring','hel','sida med skinn',58,true,'Laxfisk, branschvärde'),
('röding','hel','sida med skinn',55,true,'Laxfisk, branschvärde'),
('sill','hel','filé utan skinn',45,true,'Pelagiskt'),
('makrill','hel','filé utan skinn',50,true,'Säljs normalt hel, filé på beställning'),
('sardin','hel','filé utan skinn',45,true,'Pelagiskt'),
('stenbit','hel','filé utan skinn',35,true,'Pelagiskt'),
('tonfisk','hel','loin',55,true,'Övriga'),
('blåfenad-tonfisk','hel','loin',55,true,'Övriga'),
('svärdfisk','hel','loin',55,true,'Övriga'),
('seriola','hel','filé utan skinn',50,true,'Övriga'),
('dorade','hel','filé utan skinn',45,true,'Övriga'),
('havsabborre','hel','filé utan skinn',45,true,'Övriga'),
('madai','hel','filé utan skinn',45,true,'Övriga'),
('skipjack','hel','loin',50,true,'Övriga'),
('bläckfisk','rensad','säljbar',65,true,'Övriga'),
('calamari','rensad','säljbar',65,true,'Övriga'),
('octopus','rensad','säljbar',70,true,'Övriga'),
('räka-nordhav','hel','säljbar',100,false,'Säljs som köpt'),
('räka-nordhav','hel','kött',40,true,'Handskalade räkor'),
('taskkrabba','hel','säljbar',100,false,'Säljs hel'),
('taskkrabba','hel','kött',25,true,'Rensning, ej kokförlust'),
('hummer-europeisk','hel','säljbar',100,false,'Säljs hel/levande'),
('hummer-amerikansk','hel','säljbar',100,false,'Säljs hel/levande'),
('langust','hel','säljbar',100,false,'Säljs hel'),
('kungskrabba','hel','säljbar',100,false,'Säljs hel'),
('kungskrabba','hel','ben',60,true,'Bortsortering'),
('snökrabba','hel','säljbar',100,false,'Säljs hel'),
('snökrabba','hel','kött',25,true,'Rensning'),
('signalkräfta','hel','säljbar',100,false,'Säljs som köpt'),
('flodkräfta','hel','säljbar',100,false,'Säljs som köpt'),
('ostron-gigas','hel','säljbar',100,false,'Säljs som köpt'),
('ostron-platt','hel','säljbar',100,false,'Säljs som köpt'),
('blåmussla','hel','säljbar',100,false,'Säljs hel'),
('blåmussla','hel','kött',25,true,'Rensning'),
('vongole','hel','säljbar',100,false,'Säljs hel'),
('hjärtmussla','hel','säljbar',100,false,'Säljs hel'),
('knivmussla','hel','säljbar',100,false,'Säljs hel'),
('venusmussla','hel','säljbar',100,false,'Säljs hel'),
('mandelmussla','hel','säljbar',100,false,'Säljs hel'),
('grönmussla','hel','säljbar',100,false,'Säljs hel'),
('kammussla','hel','säljbar',100,false,'Säljs hel'),
('drottningkammussla','hel','säljbar',100,false,'Säljs hel'),
('strandsnäcka','hel','säljbar',100,false,'Säljs som köpt'),
('valthornssnäcka','hel','säljbar',100,false,'Säljs som köpt'),
('abalone','hel','säljbar',100,false,'Säljs som köpt'),
('tigerräka','hel','säljbar',100,false,'Säljs som köpt'),
('vannameiräka','hel','säljbar',100,false,'Säljs som köpt'),
('argentinsk-rödräka','hel','säljbar',100,false,'Säljs som köpt'),
('carabinero','hel','säljbar',100,false,'Säljs som köpt'),
('softshell-crab','hel','säljbar',100,false,'Säljs som köpt');

-- SEED: cut splits (procent AV FILÉN)
INSERT INTO public.cut_splits (species_group, detail_form, pct_of_fillet, margin_weight, is_optional, sort_order) VALUES
('torsk','rygg',55,1.35,false,1),
('torsk','slag',25,0.7,false,2),
('torsk','stjärtbit',20,0.8,false,3),
('torsk','kontrarygg',15,1.15,true,4),
('sej','rygg',55,1.35,false,1),
('sej','slag',25,0.7,false,2),
('sej','stjärtbit',20,0.8,false,3),
('sej','kontrarygg',15,1.15,true,4),
('rundfisk','rygg',50,1.3,false,1),
('rundfisk','övrigt',50,0.8,false,2),
('rundfisk','kontrarygg',15,1.15,true,3),
('plattfisk','filé utan skinn',100,1,false,1),
('plattfisk','kotlett',100,1,true,2),
('laxfisk','sida med skinn',100,1,false,1),
('laxfisk','portion',85,1.15,true,2),
('laxfisk','avskär',15,0.5,true,3);

-- SEED: settings
INSERT INTO public.processing_surcharges (category, surcharge_per_kg, applies) VALUES
('Färsk Fisk',35,true),('Skaldjur',35,true),('Sillar',35,true),('Rökta Produkter',35,true),
('Konserver & Torkat',0,false),('Såser & Röror',35,true),('Löjrom & Kaviar',0,false),
('Delikatesser',35,true),('Varmkök',35,true),('Frukt & Grönt',0,false),('Frys',35,true),
('Emballage & Förbrukning',0,false),('Råvaror & Storhushåll',0,false);

INSERT INTO public.margin_targets (region, label, target_pct) VALUES
('stockholm','Stockholm (Bromma, Kungsholmen)',55),
('vast','Göteborg (Torslanda Torg, Amhult, Särö, Eriksberg)',45);

INSERT INTO public.vat_rates (category, rate, valid_from, valid_to, note) VALUES
('*',6,'2026-04-01','2027-12-31','Livsmedel, tillfällig sats'),
('Emballage & Förbrukning',25,'2026-01-01',NULL,'Ej livsmedel'),
('Servering på plats',12,'2026-01-01',NULL,'Servering');