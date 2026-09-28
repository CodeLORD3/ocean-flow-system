CREATE TABLE public.authority_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  myndighet text NOT NULL,
  diarienummer text,
  legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  beslutsdatum date,
  krav text NOT NULL,
  atgard text,
  deadline date,
  status text NOT NULL DEFAULT 'öppen' CHECK (status IN ('öppen','åtgärdad','skickad','avslutad')),
  ansvarig text,
  bevis jsonb NOT NULL DEFAULT '[]'::jsonb,
  skapad timestamptz NOT NULL DEFAULT now(),
  uppdaterad timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_cases TO authenticated;
GRANT ALL ON public.authority_cases TO service_role;
ALTER TABLE public.authority_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin hanterar myndighetsärenden" ON public.authority_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.authority_case_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.authority_cases(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('deviation','control_record')),
  link_id uuid NOT NULL,
  skapad timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, link_type, link_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_case_links TO authenticated;
GRANT ALL ON public.authority_case_links TO service_role;
ALTER TABLE public.authority_case_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin hanterar ärendekopplingar" ON public.authority_case_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.authority_cases_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.uppdaterad = now(); RETURN NEW; END $$;
CREATE TRIGGER authority_cases_touch BEFORE UPDATE ON public.authority_cases FOR EACH ROW EXECUTE FUNCTION public.authority_cases_touch();

CREATE OR REPLACE FUNCTION public.run_system_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ts timestamptz := now(); d date := (now() at time zone 'Europe/Stockholm')::date; res jsonb;
begin
  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'dagsrapport_saknas', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('butik', x.store_name, 'dag', x.day) order by x.day, x.store_name)
  from public.dagsrapporter_saknas(d - 7, d - 1) x;

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'veckorapport_olast', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('butik', s.name, 'vecka', w.iso_week))
  from weekly_store_reports w join stores s on s.id = w.store_id
  where w.status = 'pagaende' and w.week_end < d;

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'noll_personaltimmar', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('butik', s.name, 'vecka', w.iso_week, 'oppna_dagar', w.expected_open_days))
  from weekly_store_reports w join stores s on s.id = w.store_id
  where coalesce(w.staff_hours,0) = 0 and coalesce(w.expected_open_days,0) > 0
    and w.week_start >= d - 14 and w.week_end < d;

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'fortnox_fel_24h', case when coalesce(sum(n),0)=0 then 'ok' else 'fel' end, coalesce(sum(n),0)::int,
         jsonb_agg(jsonb_build_object('bolag', e, 'sokvag', p, 'status', sc, 'antal', n) order by n desc)
  from (select legal_entity_code e, regexp_replace(path, '[0-9]+', 'N', 'g') p, status_code sc, count(*) n
        from fortnox_api_log f where f.status_code between 400 and 499 and f.created_at > ts - interval '24 hours'
          -- 429 som lyckades vid omförsök (samma bolag och sökväg inom 2 minuter) räknas inte som fel.
          and not (f.status_code = 429 and exists (select 1 from fortnox_api_log g
                   where g.legal_entity_code = f.legal_entity_code and g.path = f.path
                     and g.status_code between 200 and 299
                     and g.created_at between f.created_at and f.created_at + interval '2 minutes'))
        group by 1,2,3) q;

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'shopify_webhook_fel', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('status', status, 'topic', topic, 'order', shopify_order_number, 'fel', left(error, 200), 'mottagen', received_at) order by received_at desc)
  from shopify_webhook_events
  where resolved_by is null and received_at > ts - interval '7 days'
    and (error is not null or status in ('ogiltig_hmac','osorterad'));

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'negativt_lager_nya', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('produkt', p.name, 'plats', l.name, 'saldo', f.resulting_qty, 'skapad', f.created_at) order by f.created_at desc)
  from stock_negative_flags f left join products p on p.id = f.product_id left join storage_locations l on l.id = f.location_id
  where f.acknowledged_at is null and f.created_at > ts - interval '24 hours';

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'inkop_utan_bolag', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('id', id, 'datum', coalesce(document_date, report_date, created_at::date)))
  from purchase_reports where legal_entity_id is null and coalesce(document_date, report_date, created_at::date) >= d - 60;

  -- Shopify-priser lagras inte i databasen; kontrollen kan inte mätas förrän de synkas.
  insert into system_checks(run_at, check_name, status, count, details)
  values (ts, 'shopify_prisdifferens', 'ej_matbar', 0,
          jsonb_build_object('orsak', 'Shopify-priser saknas i databasen (shopify_product_map har inget pris).',
                             'kopplade_produkter', (select count(*) from shopify_product_map where product_id is not null)));

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'kundorder_forsenad', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('order', o.id, 'butik', s.name, 'datum', o.wanted_date, 'status', o.status, 'pack', o.pack_status) order by o.wanted_date)
  from customer_orders o left join stores s on s.id = o.store_id
  where o.wanted_date < d and o.archived_at is null and o.status not in ('avhamtad','levererad','avbruten');

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'fortnox_ledger_sync', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('bolag', legal_entity_code, 'senast_lyckad', last_success_at, 'fel', left(last_error, 200)))
  from fortnox_ledger_sync_state
  where last_error is not null or last_success_at is null or last_success_at < ts - interval '36 hours';

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'vader_saknas', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('butik', s.name))
  from stores s
  where s.active and s.latitude is not null and s.longitude is not null
    and not exists (select 1 from store_weather_daily w where w.store_id = s.id and w.weather_date >= d - 1);

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'nimpos_api_saknas', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('butik', store_code, 'dag', business_date, 'meddelande', left(message, 200)))
  from nimpos_reconciliations where status = 'api_saknas' and business_date >= d - 1;

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'personalkollen_kostnadsgrupper_gammal', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('connection', connection_id, 'senast', last_run_at))
  from pk_sync_state where resource = 'costgroups' and last_run_at < ts - interval '2 days';

  insert into system_checks(run_at, check_name, status, count, details)
  select ts, 'myndighetsarende_deadline', case when count(*)=0 then 'ok' else 'fel' end, count(*)::int,
         jsonb_agg(jsonb_build_object('id', a.id, 'myndighet', a.myndighet, 'diarienummer', a.diarienummer, 'butik', s.name, 'deadline', a.deadline, 'status', a.status) order by a.deadline)
  from authority_cases a left join stores s on s.id = a.store_id
  where a.status in ('öppen','åtgärdad') and a.deadline is not null and a.deadline <= d + 7;

  -- En öppen AI-uppgift per felande kontroll.
  insert into ai_uppgifter(skapad_av, tilldelad, uppgift, prioritet, status, underlag)
  select 'Systemkontroll', case when c.check_name = 'myndighetsarende_deadline' then 'Kvalitetschef' else 'Systemägare Makrill ERP' end,
         'Systemkontroll: ' || c.check_name || ' (' || c.count || ')', 2, 'öppen',
         jsonb_build_object('check_name', c.check_name, 'run_at', c.run_at, 'count', c.count, 'details', c.details)::text
  from system_checks c
  where c.run_at = ts and c.status = 'fel'
    and not exists (select 1 from ai_uppgifter u where u.status <> 'klar'
                    and u.underlag like '%"check_name": "' || c.check_name || '"%');

  select jsonb_agg(jsonb_build_object('kontroll', c.check_name, 'status', c.status, 'antal', c.count) order by c.status desc, c.check_name)
    into res from system_checks c where c.run_at = ts;
  return res;
end $function$;