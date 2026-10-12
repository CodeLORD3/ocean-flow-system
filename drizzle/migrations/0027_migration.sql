ALTER TABLE public.report_email_settings
  ADD COLUMN IF NOT EXISTS smtp_host text NOT NULL DEFAULT 'mailcluster.loopia.se',
  ADD COLUMN IF NOT EXISTS smtp_port integer NOT NULL DEFAULT 465,
  ADD COLUMN IF NOT EXISTS smtp_user text NOT NULL DEFAULT 'caisa@fiskskaldjur.se';