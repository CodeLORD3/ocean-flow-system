REVOKE ALL ON FUNCTION public.can_see_employee_folder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_employee_folder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_employee_folder(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_folder(text) TO authenticated, service_role;