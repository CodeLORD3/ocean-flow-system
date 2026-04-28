-- Step 1: detach everything from "Räklåda (15kg)" so we can re-parent cleanly
UPDATE public.products
SET parent_product_id = NULL
WHERE parent_product_id = 'a1f48b0d-d0dd-4aa3-853a-44110325f8dc';

-- Step 2: Färska Räkor family — Basic is parent
UPDATE public.products
SET parent_product_id = '6a2daff7-15e3-4300-9dbc-32ce41000094'
WHERE id IN (
  'c5f0f1ae-c9a0-4d33-8220-35b23eb70e21', -- Färska Räkor Premium
  '34c19186-541c-4bd2-a731-508a45e41f60'  -- Färska Räkor Lyx
);

-- Step 3: Vannameiräkor m. Skal — Rå is parent
UPDATE public.products
SET parent_product_id = '4a07509a-aee8-475b-9f9b-89cb2852fcd3'
WHERE id = '5e7d7649-5a99-4cd1-b869-5d1ab30a6fa1'; -- Vannameiräkor m. Skal kokt

-- Step 4: Vannameiräkor u. Skal — Rå is parent
UPDATE public.products
SET parent_product_id = '6c739d3b-ef83-4923-a562-7ba92d5236c3'
WHERE id = '544bf57c-e1f5-4456-88a4-6878e7a7fdd6'; -- Vannameiräkor u. Skal kokt

-- Step 5: Merge duplicate "Rökta Räkor" under the existing top-level "Rökta räkor"
UPDATE public.products
SET parent_product_id = '42e6277f-3ec0-4f94-bc88-65e59e6bb4e9'
WHERE id = '0b3618d4-2802-4b24-ae2c-4c10d276588c';