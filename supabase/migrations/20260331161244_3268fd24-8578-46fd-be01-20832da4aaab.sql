
-- Only create if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_new_pledge') THEN
    CREATE TRIGGER trg_notify_new_pledge
      AFTER INSERT ON public.pledges
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_new_pledge();
  END IF;
END;
$$;
