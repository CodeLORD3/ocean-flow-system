create table public.ai_trigger_log (
  id bigint generated always as identity primary key,
  skapad timestamptz not null default now(),
  "händelse" text not null,
  "källtabell" text not null,
  "käll_id" text not null,
  ai_uppgift_id bigint references public.ai_uppgifter(id) on delete set null,
  webhook_status text,
  fel text
);
create unique index ai_trigger_log_kalla_uniq on public.ai_trigger_log ("händelse","källtabell","käll_id");
create index ai_trigger_log_skapad on public.ai_trigger_log (skapad desc);
grant select on public.ai_trigger_log to authenticated;
grant all on public.ai_trigger_log to service_role;
alter table public.ai_trigger_log enable row level security;
create policy "Admin läser triggerlogg" on public.ai_trigger_log for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

create table public.ai_trigger_settings (
  "händelse" text primary key,
  url text,
  hemlighet text,
  aktiv boolean not null default false,
  uppdaterad timestamptz not null default now()
);
grant select, insert, update on public.ai_trigger_settings to authenticated;
grant all on public.ai_trigger_settings to service_role;
alter table public.ai_trigger_settings enable row level security;
create policy "Admin hanterar webhookinställningar" on public.ai_trigger_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_ai_trigger_settings_upd before update on public.ai_trigger_settings
  for each row execute function public.ai_touch_uppdaterad();
insert into public.ai_trigger_settings("händelse") values
 ('kundorder_24h'),('avvikelse'),('temperaturavvikelse'),('negativt_lager'),('stort_inkop'),('shopify_stor_order');

-- Anropar ai_trigger asynkront. Får aldrig fälla ursprungsskrivningen.
create or replace function public.ai_trigger_fire(_event text, _table text, _id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/ai_trigger',
    headers := jsonb_build_object('Content-Type','application/json','apikey',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0'),
    body := jsonb_build_object('event',_event,'table',_table,'id',_id));
exception when others then
  begin
    insert into ai_trigger_log("händelse","källtabell","käll_id",fel)
    values (_event,_table,_id,'pg_net: '||sqlerrm) on conflict do nothing;
  exception when others then null;
  end;
end $$;
revoke execute on function public.ai_trigger_fire(text,text,text) from public, anon, authenticated;

create or replace function public.ai_trigger_dispatch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if TG_TABLE_NAME = 'customer_orders' then
      perform ai_trigger_fire('kundorder_24h','customer_orders',NEW.id::text);
      if NEW.source = 'shopify' then
        perform ai_trigger_fire('shopify_stor_order','customer_orders',NEW.id::text);
      end if;
    elsif TG_TABLE_NAME = 'deviations' then
      perform ai_trigger_fire('avvikelse','deviations',NEW.id::text);
    elsif TG_TABLE_NAME = 'control_records' then
      if NEW.status = 'avvikelse' and NEW.value_numeric is not null then
        perform ai_trigger_fire('temperaturavvikelse','control_records',NEW.id::text);
      end if;
    elsif TG_TABLE_NAME = 'stock_negative_flags' then
      perform ai_trigger_fire('negativt_lager','stock_negative_flags',NEW.id::text);
    elsif TG_TABLE_NAME = 'purchase_reports' then
      if coalesce(NEW.total_amount,0) > 50000 then
        perform ai_trigger_fire('stort_inkop','purchase_reports',NEW.id::text);
      end if;
    end if;
  exception when others then null;
  end;
  return NEW;
end $$;
revoke execute on function public.ai_trigger_dispatch() from public, anon, authenticated;

create trigger trg_ai_trigger after insert on public.customer_orders for each row execute function public.ai_trigger_dispatch();
create trigger trg_ai_trigger after insert on public.deviations for each row execute function public.ai_trigger_dispatch();
create trigger trg_ai_trigger after insert on public.control_records for each row execute function public.ai_trigger_dispatch();
create trigger trg_ai_trigger after insert on public.stock_negative_flags for each row execute function public.ai_trigger_dispatch();
create trigger trg_ai_trigger after insert or update of total_amount on public.purchase_reports for each row execute function public.ai_trigger_dispatch();