CREATE OR REPLACE FUNCTION public.set_store_membership(_staff_id uuid, _store_id uuid, _member boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid; v_left int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.staff_has_store(_store_id)) THEN
    RAISE EXCEPTION 'Du saknar behörighet för den butiken.';
  END IF;

  SELECT user_id INTO v_user FROM public.staff WHERE id = _staff_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Personalen saknar inloggningskonto och kan inte kopplas till butiken.';
  END IF;

  IF public.has_role(v_user, 'admin') THEN
    RETURN;
  END IF;

  IF _member THEN
    INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
    VALUES (v_user, 'store', _store_id::text)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
    VALUES (v_user, 'portal', 'shop')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_scopes
    WHERE user_id = v_user AND scope_type = 'store' AND scope_value = _store_id::text;

    SELECT count(*) INTO v_left FROM public.user_scopes
    WHERE user_id = v_user AND scope_type = 'store';

    IF v_left = 0 THEN
      DELETE FROM public.user_scopes
      WHERE user_id = v_user AND scope_type = 'portal' AND scope_value = 'shop';
    END IF;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.set_store_membership(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_store_membership(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_membership(uuid, uuid, boolean) TO service_role;