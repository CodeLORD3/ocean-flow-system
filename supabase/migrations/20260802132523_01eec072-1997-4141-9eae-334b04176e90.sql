UPDATE public.products
SET image_url = regexp_replace(split_part(image_url, '?', 1), '/object/sign/produktbilder/', '/object/public/produktbilder/')
WHERE image_url LIKE '%/object/sign/produktbilder/%';