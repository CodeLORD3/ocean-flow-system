INSERT INTO public.nimpos_store_map (store_code, store_id, active) VALUES
  ('alsten', 'eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7', true),
  ('kungsholmen', 'b541f4c6-1ac0-4127-8af3-761ce3ecbbd7', true),
  ('torslanda-torg', '857b421c-8319-4a66-97c1-7bff980f4967', true),
  ('amhult', '1426d0bb-dd09-46be-9d11-bc96d203eede', true),
  ('saro', '9ca4f9de-5a14-4bdf-90e7-b22246d41f55', true)
ON CONFLICT DO NOTHING;