create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  name text not null,
  phone_e164 text not null,
  channel text not null default 'whatsapp',
  active boolean not null default true,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notification_recipients(phone_e164);
grant select, insert, update, delete on public.notification_recipients to authenticated;
grant all on public.notification_recipients to service_role;
alter table public.notification_recipients enable row level security;
create policy "notification_recipients admin" on public.notification_recipients for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()))
  with check (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));

create table public.staff_feedback (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  recipient_id uuid references public.notification_recipients(id),
  sender_phone text not null,
  message text,
  twilio_message_sid text not null unique,
  received_at timestamptz not null default now(),
  category text check (category in ('makrill_erp','klagomal','kvalitet','arbetsmiljo','ide')),
  handled boolean not null default false,
  task_id bigint references public.ai_uppgifter(id)
);
grant select, update on public.staff_feedback to authenticated;
grant all on public.staff_feedback to service_role;
alter table public.staff_feedback enable row level security;
create policy "staff_feedback admin read" on public.staff_feedback for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));
create policy "staff_feedback admin classify" on public.staff_feedback for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()))
  with check (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));

create or replace function public.staff_feedback_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'staff_feedback får inte raderas (spårbarhet)'; end if;
  if new.id is distinct from old.id or new.store_id is distinct from old.store_id
     or new.sender_phone is distinct from old.sender_phone or new.message is distinct from old.message
     or new.twilio_message_sid is distinct from old.twilio_message_sid
     or new.received_at is distinct from old.received_at or new.recipient_id is distinct from old.recipient_id then
    raise exception 'Endast kategori, hanterad och uppgift får ändras i staff_feedback';
  end if;
  return new;
end; $$;
create trigger staff_feedback_guard before update or delete on public.staff_feedback
  for each row execute function public.staff_feedback_guard();