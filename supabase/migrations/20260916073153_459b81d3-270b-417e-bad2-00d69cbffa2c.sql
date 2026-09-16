CREATE OR REPLACE FUNCTION public.purchase_report_archive_on_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.posted_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    NEW.archived_at := COALESCE(NEW.archived_at, NEW.posted_at);
  ELSIF NEW.posted_at IS NULL AND OLD.posted_at IS NOT NULL THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_report_archive_on_post ON public.purchase_reports;
CREATE TRIGGER trg_purchase_report_archive_on_post
BEFORE UPDATE OF posted_at, archived_at ON public.purchase_reports
FOR EACH ROW EXECUTE FUNCTION public.purchase_report_archive_on_post();

UPDATE public.purchase_reports
SET archived_at = posted_at
WHERE posted_at IS NOT NULL AND archived_at IS NULL;