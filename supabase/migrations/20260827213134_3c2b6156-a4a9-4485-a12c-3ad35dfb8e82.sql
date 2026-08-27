CREATE OR REPLACE FUNCTION public.time_entries_sync_staff_shift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day date;
BEGIN
  v_day := (NEW.occurred_at AT TIME ZONE 'Europe/Stockholm')::date;
  PERFORM public.staff_shifts_rebuild_from_clock_internal(NEW.employee_id, v_day);

  IF NEW.corrects_entry_id IS NOT NULL THEN
    SELECT (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date INTO v_day
      FROM public.time_entries te WHERE te.id = NEW.corrects_entry_id;
    IF v_day IS NOT NULL THEN
      PERFORM public.staff_shifts_rebuild_from_clock_internal(NEW.employee_id, v_day);
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;