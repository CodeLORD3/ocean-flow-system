UPDATE public.products SET active = false, updated_at = now()
WHERE sku IN ('SK-017','SK-020','SK-020-EP','SK-015','SK-014','FS-001-KR','FS-001-FRG','SK-012','SK-013','SK-007','SK-022','SK-023','SK-021','SK-018','SK-011','SK-034','SK-034-ARM','FS-001','SK-025','SK-016','SK-019','SK-019-HUV','SK-033','SK-010');

UPDATE public.products SET image_url = 'https://www.alaskankingcrab.com/cdn/shop/files/extra-large-red-alaskan-king-crab-legs-9.png?v=1762287723&width=800', updated_at = now()
WHERE sku IN ('SK-024','SK-024-BEN-K');

UPDATE public.products SET image_url = 'https://golden-seabreeze.com/wp-content/uploads/2025/01/24.png', updated_at = now()
WHERE sku = 'SK-024-BEN-R';

UPDATE public.products SET image_url = 'https://mariskito.com/1810-large_default/razor-clams.jpg', updated_at = now()
WHERE sku = 'SK-009';

UPDATE public.products SET image_url = 'https://jhb.se/storage/7FFB59B41742B9025F8F8F2D92723C9CA32A215B234BF27C52A30B6B09BED595/7803bad1e9c0404abb53f0e6504a490e/500-500-0-png.Png/media/2b851ae8f00140beb2babf79e36a0de3/B1365_Vongole%201%20kg.png', updated_at = now()
WHERE sku = 'SK-003';