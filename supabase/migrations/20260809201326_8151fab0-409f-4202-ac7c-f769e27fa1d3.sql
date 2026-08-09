ALTER TABLE public.price_history DROP CONSTRAINT price_history_product_id_fkey;
ALTER TABLE public.price_history ADD CONSTRAINT price_history_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_report_lines DROP CONSTRAINT inventory_report_lines_product_id_fkey;
ALTER TABLE public.inventory_report_lines ADD CONSTRAINT inventory_report_lines_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.lots DROP CONSTRAINT lots_product_id_fkey;
ALTER TABLE public.lots ADD CONSTRAINT lots_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;