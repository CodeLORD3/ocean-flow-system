DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('nimpos-nattavstamning')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nimpos-nattavstamning');
    PERFORM cron.schedule(
      'nimpos-nattavstamning',
      '15 1 * * *',
      $job$
      SELECT net.http_post(
        url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/nimpos-reconcile',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
END $$;