CREATE OR REPLACE FUNCTION public.pos_journal_no_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Journalminnet är låst. Journalposter kan varken ändras eller tas bort.';
END;
$$;