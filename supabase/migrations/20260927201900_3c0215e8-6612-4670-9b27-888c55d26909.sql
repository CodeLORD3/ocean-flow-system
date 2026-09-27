create table if not exists public.ai_uppgifter (
  id bigint generated always as identity primary key,
  skapad timestamptz default now(),
  skapad_av text,
  tilldelad text,
  uppgift text not null,
  prioritet int default 3,
  deadline timestamptz,
  status text default 'öppen' check (status in ('öppen','pågår','väntar på vd','klar')),
  resultat text,
  underlag text,
  uppdaterad timestamptz default now()
);
create table if not exists public.ai_utkast (
  id bigint generated always as identity primary key,
  skapad timestamptz default now(),
  skapad_av text,
  typ text,
  titel text not null,
  mottagare text,
  kanal text,
  innehall text,
  bilaga_url text,
  status text default 'utkast' check (status in ('utkast','redigerat','godkänt','skickat','avslaget')),
  vd_kommentar text,
  skickad timestamptz,
  uppdaterad timestamptz default now()
);
grant select, insert, update, delete on public.ai_uppgifter, public.ai_utkast to authenticated;
grant all on public.ai_uppgifter, public.ai_utkast to service_role;
alter table public.ai_uppgifter enable row level security;
alter table public.ai_utkast enable row level security;
drop policy if exists "ai_uppgifter admin" on public.ai_uppgifter;
create policy "ai_uppgifter admin" on public.ai_uppgifter for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()))
  with check (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));
drop policy if exists "ai_utkast admin" on public.ai_utkast;
create policy "ai_utkast admin" on public.ai_utkast for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()))
  with check (public.has_role(auth.uid(),'admin') or public.is_platform_admin(auth.uid()));
create or replace function public.ai_touch_uppdaterad() returns trigger language plpgsql set search_path = public as $$
begin new.uppdaterad = now(); return new; end; $$;
drop trigger if exists trg_ai_uppgifter_touch on public.ai_uppgifter;
create trigger trg_ai_uppgifter_touch before update on public.ai_uppgifter for each row execute function public.ai_touch_uppdaterad();
drop trigger if exists trg_ai_utkast_touch on public.ai_utkast;
create trigger trg_ai_utkast_touch before update on public.ai_utkast for each row execute function public.ai_touch_uppdaterad();