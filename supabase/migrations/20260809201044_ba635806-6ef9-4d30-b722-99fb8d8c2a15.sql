CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
  OR (
    _role = 'admin'::app_role
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = _user_id
        AND s.portal_access && ARRAY['admin','wholesale']
    )
  )
$function$;