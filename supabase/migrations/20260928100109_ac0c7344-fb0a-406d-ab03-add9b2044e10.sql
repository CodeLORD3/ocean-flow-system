do $mig$
declare src text;
begin
  src := pg_get_functiondef('public.run_system_checks'::regproc);
  src := replace(src,
    'from fortnox_api_log where status_code between 400 and 499 and created_at > ts - interval ''24 hours''',
    'from fortnox_api_log f where f.status_code between 400 and 499 and f.created_at > ts - interval ''24 hours''
          -- 429 som lyckades vid omförsök (samma bolag och sökväg inom 2 minuter) räknas inte som fel.
          and not (f.status_code = 429 and exists (select 1 from fortnox_api_log g
                   where g.legal_entity_code = f.legal_entity_code and g.path = f.path
                     and g.status_code between 200 and 299
                     and g.created_at between f.created_at and f.created_at + interval ''2 minutes''))');
  if src not like '%429 som lyckades%' then raise exception 'mönstret hittades inte'; end if;
  execute src;
end $mig$;

create index if not exists fortnox_api_log_entity_path_created_idx on public.fortnox_api_log (legal_entity_code, path, created_at);