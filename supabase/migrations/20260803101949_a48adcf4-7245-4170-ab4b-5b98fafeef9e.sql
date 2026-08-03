
CREATE TABLE public.species_cut_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_group text NOT NULL UNIQUE,
  cut_model text NOT NULL,
  min_piece_weight_kg numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.species_cut_models TO authenticated;
GRANT ALL ON public.species_cut_models TO service_role;
ALTER TABLE public.species_cut_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage species_cut_models" ON public.species_cut_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cut_model_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cut_model text NOT NULL,
  detail_form text NOT NULL,
  detail_name text,
  pct_of_fillet numeric NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'byproduct',
  margin_weight numeric NOT NULL DEFAULT 1,
  is_optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cut_model, detail_form)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cut_model_splits TO authenticated;
GRANT ALL ON public.cut_model_splits TO service_role;
ALTER TABLE public.cut_model_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage cut_model_splits" ON public.cut_model_splits FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.cut_splits ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'byproduct';

CREATE TABLE public.detail_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_group text NOT NULL,
  detail_form text NOT NULL,
  last_set_price numeric NOT NULL DEFAULT 0,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (species_group, detail_form)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detail_prices TO authenticated;
GRANT ALL ON public.detail_prices TO service_role;
ALTER TABLE public.detail_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage detail_prices" ON public.detail_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.byproduct_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_group text NOT NULL,
  detail_form text NOT NULL,
  price_incl_vat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (species_group, detail_form)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.byproduct_prices TO authenticated;
GRANT ALL ON public.byproduct_prices TO service_role;
ALTER TABLE public.byproduct_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage byproduct_prices" ON public.byproduct_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.auction_calcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calc_date date NOT NULL DEFAULT current_date,
  species_group text NOT NULL,
  raw_quantity numeric NOT NULL DEFAULT 0,
  raw_form text NOT NULL DEFAULT 'hel',
  yield_pct numeric,
  cut_model text,
  detail_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_price_sthlm numeric,
  max_price_gbg numeric,
  bid_price numeric,
  actual_price numeric,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_calcs TO authenticated;
GRANT ALL ON public.auction_calcs TO service_role;
ALTER TABLE public.auction_calcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage auction_calcs" ON public.auction_calcs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_processing boolean NOT NULL DEFAULT false;

CREATE TRIGGER trg_species_cut_models_updated BEFORE UPDATE ON public.species_cut_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cut_model_splits_updated BEFORE UPDATE ON public.cut_model_splits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_detail_prices_updated BEFORE UPDATE ON public.detail_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_byproduct_prices_updated BEFORE UPDATE ON public.byproduct_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_auction_calcs_updated BEFORE UPDATE ON public.auction_calcs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cut_model_splits (cut_model, detail_form, detail_name, pct_of_fillet, role, margin_weight, is_optional, sort_order) VALUES
  ('loin_four','rygg','Rygg',55,'primary',1,false,1),
  ('loin_four','benfri filé','Benfri filé',20,'byproduct',1,false,2),
  ('loin_four','slag','Slag',15,'byproduct',1,false,3),
  ('loin_four','kontrarygg','Kontrarygg',10,'byproduct',1,false,4),
  ('loin_whole','loin','Loin',70,'primary',1,false,1),
  ('loin_whole','buk','Buk',20,'byproduct',1,false,2),
  ('loin_whole','avskär','Avskär',10,'byproduct',1,false,3),
  ('salmon_side','rygg','Rygg (backloin)',60,'primary',1,false,1),
  ('salmon_side','buk','Buk (bellyloin)',40,'byproduct',1,false,2),
  ('flatfish','hel filé','Hel filé',100,'primary',1,false,1),
  ('flatfish','kotlett','Kotlett/tronçon',0,'primary',1,true,2),
  ('flatfish','fletch','Fletch',0,'primary',1,true,3),
  ('tail_only','stjärt','Stjärt',100,'primary',1,false,1),
  ('single','hel filé','Hel filé',100,'primary',1,false,1)
ON CONFLICT (cut_model, detail_form) DO UPDATE SET
  pct_of_fillet = EXCLUDED.pct_of_fillet, role = EXCLUDED.role,
  detail_name = EXCLUDED.detail_name, is_optional = EXCLUDED.is_optional,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.species_cut_models (species_group, cut_model, min_piece_weight_kg) VALUES
  ('torsk','loin_four',3),('sej','loin_four',3),('kolja','loin_four',3),('kummel','loin_four',3),
  ('långa','loin_four',3),('lubb','loin_four',3),('havskatt','loin_four',3),('kolfisk','loin_four',3),
  ('bleka','loin_four',3),('kapkummel','loin_four',3),
  ('tonfisk','loin_whole',NULL),('blåfenad-tonfisk','loin_whole',NULL),('svärdfisk','loin_whole',NULL),('seriola','loin_whole',NULL),
  ('lax','salmon_side',NULL),('regnbåge','salmon_side',NULL),('havsöring','salmon_side',NULL),('röding','salmon_side',NULL),
  ('hälleflundra','flatfish',NULL),('blåkveite','flatfish',NULL),('piggvar','flatfish',NULL),('slätvar','flatfish',NULL),
  ('rödspätta','flatfish',NULL),('sjötunga','flatfish',NULL),('bergtunga','flatfish',NULL),('rödtunga','flatfish',NULL),
  ('sillflundra','flatfish',NULL),
  ('marulk','tail_only',NULL),
  ('vitling','single',NULL),('kungsfisk','single',NULL),('abborre','single',NULL),('gädda','single',NULL),
  ('sik','single',NULL),('lake','single',NULL),('sardin','single',NULL),('sill','single',NULL),
  ('makrill','single',NULL),('taggmakrill','single',NULL),('stenbit','single',NULL),('dorade','single',NULL),
  ('havsabborre','single',NULL),('madai','single',NULL),('fjärsing','single',NULL),('knot','single',NULL),
  ('mullus','single',NULL),('silversida','single',NULL),('red-snapper','single',NULL),('papegojfisk','single',NULL),
  ('beryx','single',NULL),('skipjack','single',NULL),('stillahavskungsfisk','single',NULL),('bläckfisk','single',NULL)
ON CONFLICT (species_group) DO UPDATE SET cut_model = EXCLUDED.cut_model, min_piece_weight_kg = EXCLUDED.min_piece_weight_kg;

INSERT INTO public.detail_prices (species_group, detail_form, last_set_price, role) VALUES
  ('torsk','rygg',698,'primary'),
  ('torsk','kontrarygg',398,'byproduct'),
  ('torsk','benfri filé',249,'byproduct'),
  ('torsk','slag',129,'byproduct')
ON CONFLICT (species_group, detail_form) DO UPDATE SET last_set_price = EXCLUDED.last_set_price, role = EXCLUDED.role;

INSERT INTO public.byproduct_prices (species_group, detail_form, price_incl_vat) VALUES
  ('torsk','kontrarygg',398),
  ('torsk','benfri filé',249),
  ('torsk','slag',129)
ON CONFLICT (species_group, detail_form) DO UPDATE SET price_incl_vat = EXCLUDED.price_incl_vat;
