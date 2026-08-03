UPDATE public.yields SET grade = '' WHERE grade IS NULL;
ALTER TABLE public.yields ALTER COLUMN grade SET DEFAULT '';
ALTER TABLE public.yields ALTER COLUMN grade SET NOT NULL;
DROP INDEX IF EXISTS public.yields_species_form_grade_uniq;
ALTER TABLE public.yields
  ADD CONSTRAINT yields_species_from_to_grade_key UNIQUE (species_group, from_form, to_form, grade);