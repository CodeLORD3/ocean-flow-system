ALTER TABLE public.important_papers DROP CONSTRAINT important_papers_type_chk;
ALTER TABLE public.important_papers ADD CONSTRAINT important_papers_type_chk
  CHECK (paper_type = ANY (ARRAY['kvitto','foljesedel','faktura','brev','anteckning','kort']));

-- Kortfotona blir kort i registret
INSERT INTO public.payment_cards (store_id, card_brand, card_last4, card_holder, card_kind, active)
SELECT p.store_id, p.card_brand, p.card_last4, p.card_holder, 'foretag', true
FROM public.important_papers p
WHERE p.id IN ('0f035953-5508-479c-a2ec-b0e640537a68','e8f286e6-040d-4f75-b123-c78787b0a64d')
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_cards c WHERE c.card_last4 = p.card_last4
  );

UPDATE public.important_papers p
SET paper_type = 'kort',
    payment_method = NULL,
    card_id = c.id
FROM public.payment_cards c
WHERE p.id IN ('0f035953-5508-479c-a2ec-b0e640537a68','e8f286e6-040d-4f75-b123-c78787b0a64d')
  AND c.card_last4 = p.card_last4;

UPDATE public.important_papers
SET paper_type = 'kort'
WHERE id = '77d88c34-da2f-4735-8029-1a962f5e83ed';

-- Befintliga kortköp kopplas till rätt kort
UPDATE public.important_papers p
SET card_id = c.id
FROM public.payment_cards c
WHERE p.paper_type <> 'kort'
  AND p.card_id IS NULL
  AND p.card_last4 IS NOT NULL
  AND c.card_last4 = p.card_last4;