-- Flytta en klockstation till annan enhet (admin), utan att historik försvinner.
CREATE OR REPLACE FUNCTION public.clock_station_move(_station_id uuid, _store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entity text;
  _name text;
  _store_name text;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Välj vilken enhet stationen ska tillhöra';
  END IF;
  SELECT s.name, s.legal_entity_id INTO _store_name, _entity FROM public.stores s WHERE s.id = _store_id;
  IF _store_name IS NULL THEN
    RAISE EXCEPTION 'Enheten finns inte';
  END IF;

  UPDATE public.clock_stations
     SET store_id = _store_id,
         legal_entity_id = COALESCE(_entity, legal_entity_id),
         updated_at = now()
   WHERE id = _station_id
   RETURNING name INTO _name;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'Stationen finns inte';
  END IF;

  -- Enheten måste aktiveras om efter flytt: gammal session ska inte leva vidare.
  DELETE FROM public.clock_station_sessions WHERE station_id = _station_id;

  RETURN jsonb_build_object('station_id', _station_id, 'store_id', _store_id, 'store_name', _store_name, 'legal_entity_id', _entity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_station_move(uuid, uuid) TO authenticated;

-- Beslut: rastknappen stängs av på alla aktiva stationer. Rastavdrag hanteras av
-- chefen i attesten, eftersom rasttryck i praktiken glöms bort och ger fel lön.
UPDATE public.clock_stations
   SET profile = jsonb_set(COALESCE(profile, '{}'::jsonb), '{break,mode}', '"off"', true),
       updated_at = now()
 WHERE status = 'active';