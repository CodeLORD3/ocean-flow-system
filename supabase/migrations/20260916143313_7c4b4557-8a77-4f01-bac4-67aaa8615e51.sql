ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS work_type text;
ALTER TABLE public.checklist_template_items ADD COLUMN IF NOT EXISTS work_type text;
ALTER TABLE public.entity_images ADD COLUMN IF NOT EXISTS checklist_item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entity_images_entity_created_idx
  ON public.entity_images (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entity_images_checklist_item_idx
  ON public.entity_images (checklist_item_id);

CREATE OR REPLACE FUNCTION public.guess_work_type(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _text IS NULL THEN NULL
    WHEN _text ILIKE '%städ%' OR _text ILIKE '%golv%' OR _text ILIKE '%avlopp%' OR _text ILIKE '%rengör%' OR _text ILIKE '%disk%' THEN 'stadning'
    WHEN _text ILIKE '%kyl%' OR _text ILIKE '%frys%' OR _text ILIKE '%temperatur%' OR _text ILIKE '%temp%' THEN 'temperatur'
    WHEN _text ILIKE '%rapport%' OR _text ILIKE '%kassa%' OR _text ILIKE '%administration%' OR _text ILIKE '%bokför%' THEN 'rapporter'
    WHEN _text ILIKE '%beställ%' OR _text ILIKE '%order%' OR _text ILIKE '%inköp%' OR _text ILIKE '%leverans%' THEN 'bestallning'
    WHEN _text ILIKE '%underhåll%' OR _text ILIKE '%redskap%' OR _text ILIKE '%maskin%' OR _text ILIKE '%produktion%' OR _text ILIKE '%lås%' OR _text ILIKE '%säkerhet%' THEN 'underhall'
    WHEN _text ILIKE '%personal%' OR _text ILIKE '%morgondag%' OR _text ILIKE '%schema%' THEN 'personal'
    ELSE 'ovrigt'
  END
$$;

UPDATE public.checklist_items
   SET work_type = public.guess_work_type(coalesce(category, section, task))
 WHERE work_type IS NULL;

UPDATE public.checklist_template_items
   SET work_type = public.guess_work_type(coalesce(category, section, task))
 WHERE work_type IS NULL;