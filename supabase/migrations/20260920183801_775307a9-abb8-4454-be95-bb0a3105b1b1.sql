ALTER TABLE public.auction_purchases ADD COLUMN IF NOT EXISTS box_photo_urls text[];
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS box_photo_urls text[];