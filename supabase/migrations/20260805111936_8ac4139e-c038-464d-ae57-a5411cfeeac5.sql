CREATE TABLE public.checklist_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage checklist template list" ON public.checklist_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER checklist_templates_set_updated_at BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.checklist_templates (id, store_id, name, description, sort_order)
VALUES ('00000000-0000-4000-8000-0000000000c1', NULL, 'Daglig checklista', 'Standardlista för butikens dagliga rutiner', 0);

ALTER TABLE public.checklist_template_items
  ADD COLUMN template_id uuid REFERENCES public.checklist_templates(id) ON DELETE CASCADE;
UPDATE public.checklist_template_items SET template_id = '00000000-0000-4000-8000-0000000000c1' WHERE template_id IS NULL;
ALTER TABLE public.checklist_template_items ALTER COLUMN template_id SET NOT NULL;
ALTER TABLE public.checklist_template_items ALTER COLUMN template_id SET DEFAULT '00000000-0000-4000-8000-0000000000c1';

ALTER TABLE public.checklist_days
  ADD COLUMN template_id uuid REFERENCES public.checklist_templates(id) ON DELETE CASCADE;
UPDATE public.checklist_days SET template_id = '00000000-0000-4000-8000-0000000000c1' WHERE template_id IS NULL;
ALTER TABLE public.checklist_days ALTER COLUMN template_id SET NOT NULL;
ALTER TABLE public.checklist_days ALTER COLUMN template_id SET DEFAULT '00000000-0000-4000-8000-0000000000c1';

ALTER TABLE public.checklist_days DROP CONSTRAINT checklist_days_store_id_checklist_date_key;
ALTER TABLE public.checklist_days ADD CONSTRAINT checklist_days_store_date_template_key UNIQUE (store_id, checklist_date, template_id);