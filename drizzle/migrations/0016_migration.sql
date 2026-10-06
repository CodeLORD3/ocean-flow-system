alter table public.ai_utkast
  add column if not exists ai_generated boolean not null default false,
  add column if not exists telegram_message_id uuid,
  add column if not exists conv_key text,
  add column if not exists foreslagen_kategori text,
  add column if not exists utfall text check (utfall in ('skickat_oforandrat','andrat','kastat')),
  add column if not exists utfall_av uuid,
  add column if not exists utfall_tid timestamptz,
  add column if not exists slutlig_text text;
create unique index if not exists ai_utkast_telegram_message_uq on public.ai_utkast(telegram_message_id) where telegram_message_id is not null;
create index if not exists ai_utkast_conv_key_idx on public.ai_utkast(conv_key) where conv_key is not null;

drop policy if exists "ai_utkast telegram ai läs" on public.ai_utkast;
create policy "ai_utkast telegram ai läs" on public.ai_utkast for select to authenticated
  using (kanal = 'telegram' and ai_generated and public.is_telegram_admin());

-- Kasta ett AI-förslag (Skicka går via telegram-send).
create or replace function public.telegram_ai_discard(_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_telegram_admin() then raise exception 'Saknar behörighet'; end if;
  update ai_utkast set status = 'avslaget', utfall = 'kastat', utfall_av = auth.uid(), utfall_tid = now()
   where id = _id and kanal = 'telegram' and ai_generated and utfall is null;
end $$;
revoke all on function public.telegram_ai_discard(bigint) from public, anon;
grant execute on function public.telegram_ai_discard(bigint) to authenticated;

-- Väcker AI-förslaget asynkront; funktionen läser om raden själv.
create or replace function public.telegram_ai_suggest_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.direction = 'in' and NEW.chat_type = 'private' and NEW.kind in ('text','voice')
     and coalesce(btrim(NEW.body), '') <> '' and NEW.body !~* 'sjuk' and NEW.body !~* '^/start' then
    perform net.http_post(
      url := 'https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/telegram-ai-suggest',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0"}'::jsonb,
      body := jsonb_build_object('id', NEW.id));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_telegram_ai_suggest on public.telegram_messages;
create trigger trg_telegram_ai_suggest after insert on public.telegram_messages
  for each row execute function public.telegram_ai_suggest_dispatch();