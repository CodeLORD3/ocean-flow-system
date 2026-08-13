ALTER TABLE public.shopify_webhook_events
  ADD COLUMN IF NOT EXISTS raw_body text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE public.shopify_webhook_events DROP CONSTRAINT shopify_webhook_events_status_check;
ALTER TABLE public.shopify_webhook_events
  ADD CONSTRAINT shopify_webhook_events_status_check
  CHECK (status = ANY (ARRAY['koad','bearbetar','mottagen','skapad','osorterad','ogiltig_hmac','fel','duplikat']));

CREATE INDEX IF NOT EXISTS shopify_webhook_events_status_idx
  ON public.shopify_webhook_events (status, received_at DESC);