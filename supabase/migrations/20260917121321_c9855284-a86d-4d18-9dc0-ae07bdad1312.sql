CREATE TABLE public.important_papers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  paper_type text NOT NULL DEFAULT 'kvitto',
  title text,
  company_name text,
  paper_date date,
  net_amount numeric,
  vat_amount numeric,
  gross_amount numeric,
  currency text NOT NULL DEFAULT 'CHF',
  document_number text,
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  file_url text,
  file_name text,
  file_mime text,
  created_by uuid DEFAULT auth.uid(),
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT important_papers_type_chk CHECK (paper_type IN ('kvitto','foljesedel','faktura','brev','anteckning'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.important_papers TO authenticated;
GRANT ALL ON public.important_papers TO service_role;

ALTER TABLE public.important_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal ser papper" ON public.important_papers
  FOR SELECT TO authenticated
  USING (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)));

CREATE POLICY "Personal lagger in papper" ON public.important_papers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND created_by = auth.uid());

CREATE POLICY "Agare eller chef andrar papper" ON public.important_papers
  FOR UPDATE TO authenticated
  USING (public.is_staff() AND (created_by = auth.uid() OR public.is_staff_manager() OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (public.is_staff());

CREATE POLICY "Agare eller chef tar bort papper" ON public.important_papers
  FOR DELETE TO authenticated
  USING (public.is_staff() AND (created_by = auth.uid() OR public.is_staff_manager() OR public.has_role(auth.uid(), 'admin')));

CREATE INDEX important_papers_store_idx ON public.important_papers (store_id, paper_date DESC);
CREATE INDEX important_papers_type_idx ON public.important_papers (paper_type);

CREATE TRIGGER important_papers_touch
  BEFORE UPDATE ON public.important_papers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();