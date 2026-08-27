CREATE OR REPLACE FUNCTION public.clock_station_create(_name text, _store_id uuid, _legal_entity_id text DEFAULT NULL::text, _profile jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text;
  v_id uuid;
  v_entity text;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  v_entity := coalesce(_legal_entity_id, (SELECT legal_entity_id FROM public.stores WHERE id = _store_id));
  INSERT INTO public.clock_stations (name, store_id, legal_entity_id, activation_code_hash, activation_code_hint)
  VALUES (_name, _store_id, v_entity, public.clock_code_hash(v_code), right(v_code, 4))
  RETURNING id INTO v_id;
  IF _profile IS NOT NULL THEN
    UPDATE public.clock_stations SET profile = profile || _profile WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('station_id', v_id, 'activation_code', v_code);
END;
$function$;