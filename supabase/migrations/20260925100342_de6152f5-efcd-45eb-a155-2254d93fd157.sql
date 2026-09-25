CREATE OR REPLACE FUNCTION public.staff_ensure_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE staff_id = NEW.id) THEN
    INSERT INTO public.employees (first_name, last_name, email, staff_id)
    VALUES (COALESCE(NEW.first_name,''), COALESCE(NEW.last_name,''), NEW.email, NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_ensure_employee() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_staff_ensure_employee ON public.staff;
CREATE TRIGGER trg_staff_ensure_employee AFTER INSERT ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.staff_ensure_employee();
INSERT INTO public.employees (first_name, last_name, email, staff_id)
SELECT s.first_name, s.last_name, s.email, s.id FROM public.staff s
WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.staff_id = s.id);