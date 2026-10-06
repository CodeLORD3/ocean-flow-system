alter table public.stores add column if not exists voice_report_enabled boolean not null default false;

create table if not exists public.voice_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('telegram','app')),
  telegram_message_id uuid unique references public.telegram_messages(id) on delete set null,
  chat_id bigint,
  telegram_user_id bigint,
  store_id uuid references public.stores(id),
  location_id uuid references public.storage_locations(id),
  employee_id uuid,
  user_id uuid,
  audio_path text,
  status text not null default 'mottagen' check (status in ('mottagen','vantar_nyckel','tolkad','vantar_spara','sparad','fel')),
  transcript text,
  lines jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  error text,
  saved_at timestamptz,
  saved_by uuid,
  movement_count integer,
  updated_at timestamptz not null default now()
);
grant select on public.voice_reports to authenticated;
grant all on public.voice_reports to service_role;
alter table public.voice_reports enable row level security;
create policy "voice_reports läs" on public.voice_reports for select to authenticated
  using (public.has_role(auth.uid(),'admin') or (store_id is not null and public.can_see_store(store_id)));
create index if not exists voice_reports_created_idx on public.voice_reports(created_at desc);

-- Sparar tolkade rader som lagerrörelser. Enda skrivvägen; körs en gång per rapport.
create or replace function public.voice_report_save(_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.voice_reports; l jsonb; cur numeric; qty numeric; delta numeric; typ text;
  ref uuid; n int := 0; staff_id uuid; unit text; cost numeric;
begin
  select * into r from voice_reports where id = _id for update;
  if not found then raise exception 'Röstrapporten finns inte'; end if;
  if auth.uid() is not null then
    if not (has_role(auth.uid(),'admin') or (r.store_id is not null and can_see_store(r.store_id))) then
      raise exception 'Saknar behörighet';
    end if;
  elsif coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Saknar behörighet';
  end if;
  if r.status = 'sparad' then return jsonb_build_object('already', true, 'count', r.movement_count); end if;
  if r.status <> 'vantar_spara' then raise exception 'Rapporten är inte klar att spara'; end if;
  if r.location_id is null then raise exception 'Butiken saknar lagerplats'; end if;
  ref := coalesce(r.telegram_message_id, r.id);
  if exists (select 1 from stock_movements where reference_type = 'rostrapport' and reference_id = ref) then
    update voice_reports set status = 'sparad', saved_at = coalesce(saved_at, now()), updated_at = now() where id = _id;
    return jsonb_build_object('already', true);
  end if;
  if auth.uid() is not null then select s.id into staff_id from staff s where s.user_id = auth.uid() limit 1; end if;

  for l in select * from jsonb_array_elements(r.lines) loop
    typ := l->>'typ';
    select p.unit, p.cost_price into unit, cost from products p where p.id = (l->>'product_id')::uuid;
    if not found then raise exception 'Okänd vara i rapporten'; end if;
    qty := abs((l->>'mangd')::numeric);
    if lower(coalesce(unit,'kg')) = 'kg' then qty := round(qty, 1); end if;
    if typ = 'inventering' then
      select coalesce(quantity,0) into cur from product_stock_locations where product_id = (l->>'product_id')::uuid and location_id = r.location_id;
      delta := round(qty - coalesce(cur,0), 3);
    elsif typ = 'svinn' then delta := -qty;
    elsif typ = 'inleverans' then delta := qty;
    else raise exception 'Okänd typ %', typ; end if;
    if delta = 0 then continue; end if;
    insert into stock_movements (product_id, location_id, movement_type, quantity_kg, unit_cost, reference_type, reference_id, note, created_by)
    values ((l->>'product_id')::uuid, r.location_id, typ, delta, nullif(cost,0), 'rostrapport', ref,
      'Röstrapport' || case when typ='svinn' and coalesce(l->>'orsak','') <> '' then ': ' || (l->>'orsak') else '' end, staff_id);
    n := n + 1;
  end loop;
  update voice_reports set status = 'sparad', saved_at = now(), saved_by = auth.uid(), movement_count = n, updated_at = now() where id = _id;
  return jsonb_build_object('count', n);
end $$;
revoke all on function public.voice_report_save(uuid) from public, anon;
grant execute on function public.voice_report_save(uuid) to authenticated, service_role;

-- Röstmeddelanden till Telegram väcker voice-report asynkront med bara {id}.
create or replace function public.voice_report_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.direction = 'in' and NEW.kind = 'voice' and NEW.chat_type = 'private' and NEW.employee_id is not null
     and NEW.file_id is not null and NEW.store_id is not null
     and exists (select 1 from stores s where s.id = NEW.store_id and s.voice_report_enabled) then
    perform net.http_post(
      url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/voice-report',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
      body := jsonb_build_object('telegram_message_id', NEW.id));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_voice_report on public.telegram_messages;
create trigger trg_voice_report after insert on public.telegram_messages
  for each row execute function public.voice_report_dispatch();