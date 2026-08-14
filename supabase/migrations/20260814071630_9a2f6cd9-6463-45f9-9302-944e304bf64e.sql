CREATE OR REPLACE FUNCTION public.set_user_scopes(_staff_id uuid, _portals text[], _store_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid; v_allowed boolean;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_scopes
        WHERE user_id = auth.uid() AND scope_type = 'portal'
          AND scope_value IN ('admin','wholesale')
      )
    INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Endast administratörer kan ändra behörigheter.';
  END IF;

  SELECT user_id INTO v_user FROM public.staff WHERE id = _staff_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Personalen saknar inloggningskonto och kan inte få behörigheter.';
  END IF;

  DELETE FROM public.user_scopes WHERE user_id = v_user AND scope_type IN ('portal', 'store');
  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'portal', p FROM unnest(COALESCE(_portals, '{}'::text[])) p
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'store', sid::text FROM unnest(COALESCE(_store_ids, '{}'::uuid[])) sid
  ON CONFLICT DO NOTHING;
END $$;

-- Nya inloggningar ska aldrig hamna helt utan behörighet:
-- när ett personalkort kopplas till ett konto och det saknar behörighetsrader
-- får kontot butiksportalen plus sin egen butik.
CREATE OR REPLACE FUNCTION public.seed_default_scopes_for_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.user_scopes WHERE user_id = NEW.user_id
             AND scope_type IN ('portal','store')) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  VALUES (NEW.user_id, 'portal', 'shop')
  ON CONFLICT DO NOTHING;
  IF NEW.store_id IS NOT NULL THEN
    INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
    VALUES (NEW.user_id, 'store', NEW.store_id::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_default_scopes ON public.staff;
CREATE TRIGGER trg_seed_default_scopes
AFTER INSERT OR UPDATE OF user_id, store_id ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.seed_default_scopes_for_staff();