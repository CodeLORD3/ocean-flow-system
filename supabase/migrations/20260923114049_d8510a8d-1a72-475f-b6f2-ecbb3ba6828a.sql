CREATE OR REPLACE FUNCTION public.pos_demo_training_sequence(p_register_id uuid)
RETURNS TABLE(events bigint, journal_seq bigint, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r public.pos_registers;
  v_session uuid;
  v_staff uuid;
  i int;
  v_count bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör får köra demosekvensen.';
  END IF;

  SELECT * INTO r FROM public.pos_registers WHERE id = p_register_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Kassaregistret finns inte.';
  END IF;

  SELECT s.id INTO v_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;

  -- Stäng ett eventuellt öppet övningspass först: max ett öppet pass per kassa.
  UPDATE public.pos_sessions
     SET status = 'closed', closed_at = now(), closed_by_staff_id = v_staff
   WHERE register_id = r.id AND status = 'open';

  PERFORM public.pos_journal_append(r.id, 'training_on',
    jsonb_build_object('training', true, 'demo', true), v_staff);
  v_count := v_count + 1;

  INSERT INTO public.pos_sessions (register_id, store_id, opened_by_staff_id, opening_float, training)
  VALUES (r.id, r.store_id, v_staff, 0, true)
  RETURNING id INTO v_session;

  PERFORM public.pos_journal_append(r.id, 'session_open',
    jsonb_build_object('training', true, 'demo', true, 'opening_float', 0), v_staff, v_session);
  v_count := v_count + 1;

  FOR i IN 1..3 LOOP
    PERFORM public.pos_journal_append(r.id, 'receipt_finalized',
      jsonb_build_object(
        'training', true, 'demo', true,
        'receipt_number', 'OVNING-' || i::text,
        'total', 0, 'currency', (SELECT currency FROM public.stores WHERE id = r.store_id),
        'lines', jsonb_build_array(jsonb_build_object('name', 'Övningsrad ' || i::text, 'qty', 1, 'amount', 0))
      ), v_staff, v_session, gen_random_uuid());
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.pos_sessions
     SET status = 'closed', closed_at = now(), closed_by_staff_id = v_staff
   WHERE id = v_session;

  PERFORM public.pos_journal_append(r.id, 'session_close',
    jsonb_build_object('training', true, 'demo', true, 'receipts', 3), v_staff, v_session);
  v_count := v_count + 1;

  PERFORM public.pos_journal_append(r.id, 'training_off',
    jsonb_build_object('training', true, 'demo', true), v_staff);
  v_count := v_count + 1;

  -- Övningskvitton räknas separat. gt_sales rörs aldrig.
  UPDATE public.pos_grand_totals
     SET training_count = training_count + 3, updated_at = now()
   WHERE register_id = r.id;

  RETURN QUERY
    SELECT v_count, (SELECT pr.journal_seq FROM public.pos_registers pr WHERE pr.id = r.id), v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_demo_training_sequence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_demo_training_sequence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_demo_training_sequence(uuid) TO authenticated, service_role;