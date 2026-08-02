
CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  section text NOT NULL,
  time_label text,
  category text,
  task text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_template_items TO authenticated;
GRANT ALL ON public.checklist_template_items TO service_role;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist templates" ON public.checklist_template_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.checklist_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  checklist_date date NOT NULL,
  shift text NOT NULL DEFAULT 'Öppning',
  responsible_name text,
  responsible_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  completed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, checklist_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_days TO authenticated;
GRANT ALL ON public.checklist_days TO service_role;
ALTER TABLE public.checklist_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist days" ON public.checklist_days
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.checklist_days(id) ON DELETE CASCADE,
  section text NOT NULL,
  time_label text,
  category text,
  task text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  signature text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist items" ON public.checklist_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_checklist_items_day ON public.checklist_items(day_id);
CREATE INDEX idx_checklist_days_store_date ON public.checklist_days(store_id, checklist_date DESC);

CREATE TRIGGER trg_checklist_template_items_updated BEFORE UPDATE ON public.checklist_template_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_checklist_days_updated BEFORE UPDATE ON public.checklist_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_checklist_items_updated BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.checklist_template_items (section, time_label, category, task, sort_order) VALUES
('ÖPPNING','07:00','Öppning','Kontrollera temperatur i kylrum 1',10),
('ÖPPNING','07:05','Öppning','Kontrollera temperatur i kylrum 2',20),
('ÖPPNING','07:10','Öppning','Kontrollera temperatur i frysbox 1',30),
('ÖPPNING','07:15','Öppning','Kontrollera belysning i butik och skyltar',40),
('ÖPPNING','07:20','Öppning','Starta ismaskin och kontrollera islager',50),
('ÖPPNING','07:25','Öppning','Kontrollera larm och säkerhetssystem',60),
('ÖPPNING','07:30','Öppning','Kontrollera kaffemaskin och personalutrymme',70),
('VARUEXPONERING','07:35','Varuexponering','Fyll på fisk i disken',80),
('VARUEXPONERING','07:50','Varuexponering','Fyll på skaldjur i disken',90),
('VARUEXPONERING','08:05','Varuexponering','Kontrollera priser och skyltar',100),
('VARUEXPONERING','08:15','Varuexponering','Kontrollera att varor är rätt placerade',110),
('TEMPERATUR & EGENKONTROLL','08:30','Temperatur','Mät och logga temperatur i kylar',120),
('TEMPERATUR & EGENKONTROLL','08:35','Temperatur','Mät och logga temperatur i frysar',130),
('TEMPERATUR & EGENKONTROLL','08:40','Egenkontroll','Kontrollera egenkontrollspärmar',140),
('TEMPERATUR & EGENKONTROLL','08:50','Egenkontroll','Verkställ eventuell avvikelseåtgärd',150),
('STÄDNING','09:00','Städning','Torka av arbetsytor',160),
('STÄDNING','09:15','Städning','Rengör golv i butik',170),
('STÄDNING','09:30','Städning','Rengör skärbrädor och knivar',180),
('STÄDNING','09:45','Städning','Töm och rengör soptunnor',190),
('STÄDNING','10:00','Städning','Rengör diskbänk och handfat',200),
('VARUMOTTAGNING','10:15','Inleverans','Kontrollera leverans mot följesedel',210),
('VARUMOTTAGNING','10:25','Inleverans','Kontrollera temperatur på inkommande varor',220),
('VARUMOTTAGNING','10:35','Inleverans','Registrera inleverans i systemet',230),
('VARUMOTTAGNING','10:45','Inleverans','Kontrollera hållbarhetsdatum på nya varor',240),
('VARUMOTTAGNING','10:55','Inleverans','Placera varor på rätt lagerplats',250),
('UNDER DAGEN','11:30','Butik','Kontrollera isbädd i fiskdisken',260),
('UNDER DAGEN','12:00','Butik','Fyll på varor i disken',270),
('UNDER DAGEN','12:30','Temperatur','Kontrollmätning temperatur disk',280),
('UNDER DAGEN','13:00','Butik','Kontrollera att lokalen är städad',290),
('UNDER DAGEN','13:30','Butik','Kontrollera lager på emballage och påsar',300),
('UNDER DAGEN','14:00','Butik','Rotera varor enligt först in – först ut',310),
('UNDER DAGEN','14:30','Kund','Kontrollera kundzon och köhantering',320),
('UNDER DAGEN','15:00','Butik','Kontrollera svinn och kassera utgångna varor',330),
('UNDER DAGEN','15:30','Temperatur','Kontrollmätning temperatur kylrum',340),
('UNDER DAGEN','16:00','Butik','Kontrollera priser mot dagens prislista',350),
('KASSA & FÖRSÄLJNING','16:30','Kassa','Kontrollera växelkassa',360),
('KASSA & FÖRSÄLJNING','16:45','Kassa','Kontrollera kortterminal',370),
('KASSA & FÖRSÄLJNING','17:00','Kassa','Kontrollera kvittorulle och skrivare',380),
('STÄNGNING','17:30','Stängning','Töm och rengör fiskdisken',390),
('STÄNGNING','17:45','Stängning','Flytta kvarvarande varor till kylrum',400),
('STÄNGNING','18:00','Stängning','Rengör golv och avlopp',410),
('STÄNGNING','18:10','Stängning','Töm sopor och kartong',420),
('STÄNGNING','18:20','Stängning','Slutmätning temperatur kyl och frys',430),
('STÄNGNING','18:30','Kassa','Dagsavslut i kassan',440),
('STÄNGNING','18:40','Stängning','Kontrollera att all utrustning är avstängd',450),
('STÄNGNING','18:50','Stängning','Lås dörrar och aktivera larm',460),
('STÄNGNING','19:00','Stängning','Signera dagens egenkontroll',470);
