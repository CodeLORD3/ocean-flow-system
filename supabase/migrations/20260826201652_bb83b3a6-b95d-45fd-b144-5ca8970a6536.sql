select cron.unschedule('fortnox-sync-invoice-status') where exists (select 1 from cron.job where jobname = 'fortnox-sync-invoice-status');
select cron.schedule(
  'fortnox-sync-invoice-status',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fortnox_functions_url') || '/fortnox-sync-invoice-status',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fortnox_cron_secret')),
    body    := '{}'::jsonb
  );
  $$
);