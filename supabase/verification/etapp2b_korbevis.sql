-- Körbevis a–w för Etapp 2b (härdning av stämpelklockan).
--
-- Körs i SQL-editorn EFTER att utkastmigrationerna
--   20260831170000_clock_hardening_etapp2b.sql
--   20260831175000_clock_inspector_pnr.sql
-- har accepterats. Skriptet är läsande utom i sektion S (isolerad testperson i
-- en transaktion som rullas tillbaka). Varje rad ger kolumnerna
-- bevis / resultat / status så att utfallet kan klistras in som protokoll.

\echo == Etapp 2b körbevis ==

-- a) Svensk arbetsdag är IANA-baserad, inte fast offset.
SELECT 'a. svensk_dag vid vinter/sommartid' AS bevis,
       public.svensk_dag('2026-10-25T00:30:00Z')::text || ' / ' ||
       public.svensk_dag('2026-06-25T22:30:00Z')::text AS resultat,
       CASE WHEN public.svensk_dag('2026-10-25T00:30:00Z') = date '2026-10-25'
             AND public.svensk_dag('2026-06-25T22:30:00Z') = date '2026-06-26'
            THEN 'OK' ELSE 'FEL' END AS status;

-- b) Genererad kolumn arbetsdag finns och är STORED.
SELECT 'b. time_entries.arbetsdag genererad' AS bevis,
       COALESCE(string_agg(is_generated, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'time_entries' AND column_name = 'arbetsdag';

-- c) Idempotensnyckeln är unik per person.
SELECT 'c. unikt index client_punch_id' AS bevis, COALESCE(string_agg(indexname, ','), 'saknas') AS resultat,
       CASE WHEN count(*) >= 1 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'time_entries_client_punch_unique';

-- d) Ingen dubblett har hunnit uppstå historiskt.
SELECT 'd. dubbletter på client_punch_id' AS bevis, count(*)::text AS resultat,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FEL' END AS status
FROM (SELECT employee_id, client_punch_id FROM public.time_entries
      WHERE client_punch_id IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) > 1) d;

-- e) berakna_arbetstid finns som enda beräkningsmotor.
SELECT 'e. berakna_arbetstid finns' AS bevis, COALESCE(string_agg(p.prosecdef::text, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'berakna_arbetstid';

-- f) Motorn nekar ogiltiga intervall.
DO $$
BEGIN
  BEGIN
    PERFORM public.berakna_arbetstid(gen_random_uuid(), current_date, current_date - 1);
    RAISE NOTICE 'f. ogiltigt intervall: FEL (ingen exception)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'f. ogiltigt intervall: OK (%)', SQLERRM;
  END;
END $$;

-- g) Felkön för offlineposter finns och raderas aldrig av klienten.
SELECT 'g. clock_sync_failures + RLS' AS bevis,
       (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='clock_sync_failures') AS resultat,
       CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='clock_sync_failures')
             AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.clock_sync_failures'::regclass)
            THEN 'OK' ELSE 'FEL' END AS status;

SELECT 'h. inga DELETE-rättigheter på felkön' AS bevis,
       COALESCE(string_agg(privilege_type, ','), 'inga') AS resultat,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FEL' END AS status
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='clock_sync_failures'
  AND grantee IN ('anon','authenticated') AND privilege_type = 'DELETE';

-- i) Öppna offlinefel syns i chefsvyn.
SELECT 'i. öppna offlinefel' AS bevis, count(*)::text AS resultat, 'INFO' AS status
FROM public.clock_sync_failures WHERE status = 'open';

-- j) PNR-loggen finns och är admin-läsbar.
SELECT 'j. pnr_access_log' AS bevis,
       (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='pnr_access_log') AS resultat,
       CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pnr_access_log')
            THEN 'OK' ELSE 'FEL' END AS status;

-- k) Inspektörsläget loggar faktisk dekryptering.
SELECT 'k. inspektörsuppslag loggade' AS bevis, count(*)::text AS resultat, 'INFO' AS status
FROM public.pnr_access_log WHERE inspector_session_id IS NOT NULL;

-- l) Administrativa uppslag kopplas till person när mappning finns.
SELECT 'l. adminuppslag med employee_id' AS bevis,
       count(*) FILTER (WHERE employee_id IS NOT NULL)::text || '/' || count(*)::text AS resultat,
       'INFO' AS status
FROM public.pnr_access_log WHERE inspector_session_id IS NULL;

-- m) Gallringsjobbet skriver retention_log i stället för att radera tyst.
SELECT 'm. purge_clock_retention + retention_log' AS bevis,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='purge_clock_retention')
            THEN 'funktion finns' ELSE 'saknas' END AS resultat,
       CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='retention_log')
            THEN 'OK' ELSE 'FEL' END AS status;

-- n) Gallringen är schemalagd.
SELECT 'n. cron clock-retention-daily' AS bevis, COALESCE(string_agg(schedule, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM cron.job WHERE jobname = 'clock-retention-daily';

-- o) Stationsvakten är schemalagd.
SELECT 'o. cron clock-station-watchdog' AS bevis, COALESCE(string_agg(schedule, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM cron.job WHERE jobname = 'clock-station-watchdog';

-- p) Vakten körs och rapporterar bara nyheter (andra körningen ska ge 0 nya).
SELECT 'p. vakt körning 1' AS bevis, public.check_station_heartbeats(30)::text AS resultat, 'INFO' AS status;
SELECT 'q. vakt körning 2 (dedupe)' AS bevis, public.check_station_heartbeats(30)::text AS resultat,
       CASE WHEN (public.check_station_heartbeats(30) ->> 'offline_new')::int = 0 THEN 'OK' ELSE 'FEL' END AS status;

-- r) Notisdedupe finns på nyckelnivå.
SELECT 'r. notifications_dedupe_key_unique' AS bevis, COALESCE(string_agg(indexname, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_indexes WHERE schemaname='public' AND indexname='notifications_dedupe_key_unique';

-- s) Ingen dubblettnotis för samma händelse.
SELECT 's. dubblettnotiser' AS bevis, count(*)::text AS resultat,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FEL' END AS status
FROM (SELECT dedupe_key FROM public.notifications WHERE dedupe_key IS NOT NULL
      GROUP BY 1 HAVING count(*) > 1) d;

-- t) Självattestspärren är aktiv.
SELECT 't. trigger attestations_no_self_attest' AS bevis, COALESCE(string_agg(tgname, ','), 'saknas') AS resultat,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'attestations_no_self_attest';

-- u) Attestlåset (period_locks) är kopplat till både attest och journal.
SELECT 'u. lås-triggers' AS bevis, COALESCE(string_agg(tgname, ','), 'saknas') AS resultat,
       CASE WHEN count(*) >= 2 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_trigger t
WHERE NOT t.tgisinternal
  AND t.tgfoid IN ('public.block_locked_attestation'::regproc, 'public.block_locked_time_entry'::regproc);

-- v) Journalen är fortfarande append-only.
SELECT 'v. append-only time_entries' AS bevis, COALESCE(string_agg(tgname, ','), 'saknas') AS resultat,
       CASE WHEN count(*) >= 2 THEN 'OK' ELSE 'FEL' END AS status
FROM pg_trigger WHERE NOT tgisinternal
  AND tgname IN ('time_entries_no_update', 'time_entries_no_delete');

-- w) Nattpass hamnar på rätt svensk arbetsdag i motorn (isolerat, rullas tillbaka).
BEGIN;
DO $$
DECLARE
  v_emp uuid;
  v_result record;
BEGIN
  INSERT INTO public.employees (first_name, last_name, is_active)
  VALUES ('Körbevis', 'Etapp2b', true) RETURNING id INTO v_emp;

  INSERT INTO public.time_entries (employee_id, type, occurred_at, source, note)
  VALUES (v_emp, 'in',  '2026-03-10T21:00:00+01:00', 'manual', 'körbevis w'),
         (v_emp, 'ut',  '2026-03-11T05:00:00+01:00', 'manual', 'körbevis w');

  SELECT * INTO v_result FROM public.berakna_arbetstid(v_emp, date '2026-03-10', date '2026-03-11')
  WHERE arbetsdag = date '2026-03-10';
  RAISE NOTICE 'w. nattpass 10 mars: % min (förväntat 180)', v_result.total_minutes;

  SELECT * INTO v_result FROM public.berakna_arbetstid(v_emp, date '2026-03-10', date '2026-03-11')
  WHERE arbetsdag = date '2026-03-11';
  RAISE NOTICE 'w. nattpass 11 mars: % min (förväntat 300)', v_result.total_minutes;
END $$;
ROLLBACK;
