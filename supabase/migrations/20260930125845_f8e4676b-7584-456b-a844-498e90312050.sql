CREATE OR REPLACE FUNCTION public.pk_time_imports_after_stmt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pk_neutralize_lone_inside();
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.pk_time_imports_after_stmt() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pk_time_imports_after_stmt_trg ON public.pk_time_imports;
CREATE TRIGGER pk_time_imports_after_stmt_trg AFTER INSERT OR UPDATE ON public.pk_time_imports
  FOR EACH STATEMENT EXECUTE FUNCTION public.pk_time_imports_after_stmt();