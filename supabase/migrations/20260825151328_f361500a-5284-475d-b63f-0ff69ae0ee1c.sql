-- Filen ligger i mappen <employee_id>/..., så mappnamnet avgör behörigheten.
DROP POLICY IF EXISTS "Staff read personaldokument" ON storage.objects;
DROP POLICY IF EXISTS "Managers write personaldokument" ON storage.objects;
DROP POLICY IF EXISTS "Managers update personaldokument" ON storage.objects;
DROP POLICY IF EXISTS "Managers delete personaldokument" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_see_employee_folder(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folder text;
  eid uuid;
BEGIN
  folder := (storage.foldername(_name))[1];
  IF folder IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    eid := folder::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.can_see_employee(eid);
END;
$$;

REVOKE ALL ON FUNCTION public.can_see_employee_folder(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_see_employee_folder(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_employee_folder(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff_manager()
      OR (public.has_role(auth.uid(), 'store_manager')
          AND public.can_see_employee_folder(_name))
$$;

REVOKE ALL ON FUNCTION public.can_manage_employee_folder(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_folder(text) TO authenticated, service_role;

CREATE POLICY "Personaldokument readable by those who see the employee"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'personaldokument' AND public.can_see_employee_folder(name));

CREATE POLICY "Personaldokument insert by managers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'personaldokument' AND public.can_manage_employee_folder(name));

CREATE POLICY "Personaldokument update by managers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'personaldokument' AND public.can_manage_employee_folder(name))
WITH CHECK (bucket_id = 'personaldokument' AND public.can_manage_employee_folder(name));

CREATE POLICY "Personaldokument delete by managers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'personaldokument' AND public.can_manage_employee_folder(name));

-- Metadataraderna: butikschef får hantera dokument för personal hen får se.
DROP POLICY IF EXISTS "Managers manage employee docs" ON public.employee_documents;
CREATE POLICY "Managers manage employee docs"
ON public.employee_documents FOR ALL TO authenticated
USING (public.is_staff_manager()
       OR (public.has_role(auth.uid(), 'store_manager') AND public.can_see_employee(employee_id)))
WITH CHECK (public.is_staff_manager()
       OR (public.has_role(auth.uid(), 'store_manager') AND public.can_see_employee(employee_id)));
