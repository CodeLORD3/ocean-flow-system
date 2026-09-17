ALTER TABLE public.important_papers
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_holder text,
  ADD COLUMN IF NOT EXISTS expense_account text,
  ADD COLUMN IF NOT EXISTS expense_category text,
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.important_papers
  DROP CONSTRAINT IF EXISTS important_papers_card_last4_digits;
ALTER TABLE public.important_papers
  ADD CONSTRAINT important_papers_card_last4_digits
  CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');

CREATE INDEX IF NOT EXISTS important_papers_payment_idx
  ON public.important_papers (payment_method, card_last4);
CREATE INDEX IF NOT EXISTS important_papers_account_idx
  ON public.important_papers (expense_account);