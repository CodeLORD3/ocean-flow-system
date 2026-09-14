-- Nattpass fick tidigare noll OB mellan midnatt och morgonen. Lägg till
-- nattfönster och stäng den sista minuten mot midnatt.
UPDATE public.ob_windows SET end_time = '23:59:59', updated_at = now()
 WHERE end_time = '23:59:00';

INSERT INTO public.ob_windows (legal_entity_id, name, day_kind, start_time, end_time, pct, wage_code_id, sort_order, is_active, valid_from, agreement_source)
SELECT w.legal_entity_id, 'OB 70% natt', 'weekday', '00:00:00', '06:00:00', 70.00, w.wage_code_id, 6, true, '2026-09-16',
       'Förslag: nattpass efter midnatt – ska bekräftas mot kollektivavtal'
  FROM public.ob_windows w
 WHERE w.day_kind = 'weekday' AND w.pct = 70.00 AND w.start_time = '20:00:00'
   AND NOT EXISTS (
     SELECT 1 FROM public.ob_windows x
      WHERE x.legal_entity_id = w.legal_entity_id AND x.day_kind = 'weekday' AND x.start_time = '00:00:00'
   );

INSERT INTO public.ob_windows (legal_entity_id, name, day_kind, start_time, end_time, pct, wage_code_id, sort_order, is_active, valid_from, agreement_source)
SELECT w.legal_entity_id, 'OB 100% lördagsnatt', 'saturday', '00:00:00', '06:00:00', 100.00, w.wage_code_id, 7, true, '2026-09-16',
       'Förslag: nattpass efter midnatt – ska bekräftas mot kollektivavtal'
  FROM public.ob_windows w
 WHERE w.day_kind = 'saturday' AND w.start_time = '12:00:00'
   AND NOT EXISTS (
     SELECT 1 FROM public.ob_windows x
      WHERE x.legal_entity_id = w.legal_entity_id AND x.day_kind = 'saturday' AND x.start_time = '00:00:00'
   );