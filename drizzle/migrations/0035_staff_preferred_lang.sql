ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS preferred_lang text NOT NULL DEFAULT 'sv';
ALTER TABLE public.staff ADD CONSTRAINT staff_preferred_lang_check CHECK (preferred_lang IN ('sv','ti','en','ar'));
CREATE OR REPLACE FUNCTION public.set_staff_lang(_staff_id uuid, _lang text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _lang NOT IN ('sv','ti','en','ar') THEN RAISE EXCEPTION 'Okänt språk'; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.staff WHERE id=_staff_id AND user_id=auth.uid())) THEN
    RAISE EXCEPTION 'Ingen behörighet';
  END IF;
  UPDATE public.staff SET preferred_lang=_lang WHERE id=_staff_id;
END $$;
REVOKE ALL ON FUNCTION public.set_staff_lang(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_lang(uuid,text) TO authenticated;