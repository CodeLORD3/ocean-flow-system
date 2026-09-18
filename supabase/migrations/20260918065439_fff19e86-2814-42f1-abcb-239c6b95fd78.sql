alter table public.customer_orders
  add column if not exists packed_by_name text,
  add column if not exists packed_by_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists received_by_staff_id uuid references public.staff(id) on delete set null;