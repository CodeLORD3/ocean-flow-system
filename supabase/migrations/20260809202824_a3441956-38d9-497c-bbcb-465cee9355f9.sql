ALTER TABLE public.manual_schedule_entries
  DROP CONSTRAINT manual_schedule_entries_product_id_fkey,
  ADD CONSTRAINT manual_schedule_entries_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;