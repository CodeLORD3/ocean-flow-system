create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.fortnox_connections (
  id                      uuid primary key default gen_random_uuid(),
  legal_entity_code       text not null unique,
  legal_entity_name       text not null,
  fortnox_database_number text,
  fortnox_company_name    text,
  fortnox_org_number      text,
  scopes                  text[] not null default '{}',
  account_type            text not null default 'service',
  access_secret_id        uuid,
  refresh_secret_id       uuid,
  access_token_expires_at timestamptz,
  refresh_lock_until      timestamptz,
  status                  text not null default 'disconnected'
                          check (status in ('disconnected','connected','needs_reauth','error')),
  last_error              text,
  last_refreshed_at       timestamptz,
  connected_by            uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

insert into public.fortnox_connections (legal_entity_code, legal_entity_name) values
  ('de-no1', 'DE No.1 AB'),
  ('fsab-se', 'Fisk & Skaldjursspecialisten AB')
on conflict (legal_entity_code) do nothing;

create table if not exists public.fortnox_oauth_states (
  state             text primary key,
  legal_entity_code text not null,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create table if not exists public.fortnox_customers (
  legal_entity_code text not null,
  customer_number   text not null,
  name              text,
  org_number        text,
  org_number_norm   text generated always as (regexp_replace(coalesce(org_number,''), '\D', '', 'g')) stored,
  email             text,
  city              text,
  country_code      text,
  currency          text,
  vat_type          text,
  active            boolean not null default true,
  raw               jsonb,
  synced_at         timestamptz not null default now(),
  primary key (legal_entity_code, customer_number)
);
create index if not exists fortnox_customers_org_idx on public.fortnox_customers (legal_entity_code, org_number_norm);
create index if not exists fortnox_customers_name_idx on public.fortnox_customers (legal_entity_code, lower(name));

create table if not exists public.fortnox_customer_map (
  id                       uuid primary key default gen_random_uuid(),
  legal_entity_code        text not null,
  makrilltrade_customer_id uuid not null,
  fortnox_customer_number  text not null,
  match_method             text not null default 'manual',
  confirmed                boolean not null default false,
  created_at               timestamptz not null default now(),
  unique (legal_entity_code, makrilltrade_customer_id),
  unique (legal_entity_code, fortnox_customer_number)
);

create table if not exists public.fortnox_article_map (
  id                     uuid primary key default gen_random_uuid(),
  legal_entity_code      text not null,
  product_id             uuid not null,
  fortnox_article_number text not null,
  created_at             timestamptz not null default now(),
  unique (legal_entity_code, product_id)
);

create table if not exists public.fortnox_invoice_jobs (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null unique,
  legal_entity_code       text not null,
  idempotency_key         text not null unique,
  status                  text not null default 'pending'
                          check (status in ('pending','creating','created','bookkept','sent','failed')),
  fortnox_document_number text,
  fortnox_url             text,
  request_payload         jsonb,
  response                jsonb,
  stock_booked_at         timestamptz,
  attempts                int not null default 1,
  last_error              text,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.fortnox_api_log (
  id                bigserial primary key,
  legal_entity_code text,
  method            text,
  path              text,
  status_code       int,
  duration_ms       int,
  error             text,
  created_at        timestamptz not null default now()
);
create index if not exists fortnox_api_log_created_idx on public.fortnox_api_log (created_at desc);

grant select on public.fortnox_connections to authenticated;
grant all on public.fortnox_connections to service_role;
grant all on public.fortnox_oauth_states to service_role;
grant select on public.fortnox_customers to authenticated;
grant all on public.fortnox_customers to service_role;
grant select, insert, update, delete on public.fortnox_customer_map to authenticated;
grant all on public.fortnox_customer_map to service_role;
grant select on public.fortnox_article_map to authenticated;
grant all on public.fortnox_article_map to service_role;
grant select on public.fortnox_invoice_jobs to authenticated;
grant all on public.fortnox_invoice_jobs to service_role;
grant select on public.fortnox_api_log to authenticated;
grant all on public.fortnox_api_log to service_role;
grant usage, select on sequence public.fortnox_api_log_id_seq to service_role;

create or replace function public.fortnox_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_fortnox_connections_touch on public.fortnox_connections;
create trigger trg_fortnox_connections_touch before update on public.fortnox_connections
  for each row execute function public.fortnox_touch_updated_at();
drop trigger if exists trg_fortnox_invoice_jobs_touch on public.fortnox_invoice_jobs;
create trigger trg_fortnox_invoice_jobs_touch before update on public.fortnox_invoice_jobs
  for each row execute function public.fortnox_touch_updated_at();

alter table public.fortnox_connections   enable row level security;
alter table public.fortnox_oauth_states  enable row level security;
alter table public.fortnox_customers     enable row level security;
alter table public.fortnox_customer_map  enable row level security;
alter table public.fortnox_article_map   enable row level security;
alter table public.fortnox_invoice_jobs  enable row level security;
alter table public.fortnox_api_log       enable row level security;

create policy "fortnox_connections_read"  on public.fortnox_connections  for select to authenticated using (true);
create policy "fortnox_customers_read"    on public.fortnox_customers    for select to authenticated using (true);
create policy "fortnox_customer_map_rw"   on public.fortnox_customer_map for all    to authenticated using (true) with check (true);
create policy "fortnox_article_map_read"  on public.fortnox_article_map  for select to authenticated using (true);
create policy "fortnox_invoice_jobs_read" on public.fortnox_invoice_jobs for select to authenticated using (true);
create policy "fortnox_api_log_read"      on public.fortnox_api_log      for select to authenticated using (true);

create or replace function public.fortnox_store_tokens(
  p_entity text, p_access text, p_refresh text, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_conn public.fortnox_connections%rowtype;
begin
  select * into v_conn from public.fortnox_connections where legal_entity_code = p_entity for update;
  if not found then raise exception 'Fortnox connection % not found', p_entity; end if;

  if v_conn.access_secret_id is null then
    v_conn.access_secret_id := vault.create_secret(p_access, 'fortnox_access_' || p_entity);
  else
    perform vault.update_secret(v_conn.access_secret_id, p_access);
  end if;

  if v_conn.refresh_secret_id is null then
    v_conn.refresh_secret_id := vault.create_secret(p_refresh, 'fortnox_refresh_' || p_entity);
  else
    perform vault.update_secret(v_conn.refresh_secret_id, p_refresh);
  end if;

  update public.fortnox_connections set
    access_secret_id        = v_conn.access_secret_id,
    refresh_secret_id       = v_conn.refresh_secret_id,
    access_token_expires_at = p_expires_at,
    refresh_lock_until      = null,
    status                  = 'connected',
    last_error              = null,
    last_refreshed_at       = now()
  where id = v_conn.id;
end $$;

create or replace function public.fortnox_read_tokens(p_entity text)
returns table (access_token text, refresh_token text, expires_at timestamptz, status text)
language sql security definer set search_path = public, vault as $$
  select a.decrypted_secret, r.decrypted_secret, c.access_token_expires_at, c.status
  from public.fortnox_connections c
  left join vault.decrypted_secrets a on a.id = c.access_secret_id
  left join vault.decrypted_secrets r on r.id = c.refresh_secret_id
  where c.legal_entity_code = p_entity;
$$;

create or replace function public.fortnox_claim_refresh(p_entity text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update public.fortnox_connections
     set refresh_lock_until = now() + interval '60 seconds'
   where legal_entity_code = p_entity
     and (refresh_lock_until is null or refresh_lock_until < now())
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.fortnox_release_refresh(p_entity text) returns void
language sql security definer set search_path = public as $$
  update public.fortnox_connections set refresh_lock_until = null where legal_entity_code = p_entity;
$$;

revoke all on function public.fortnox_store_tokens(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.fortnox_read_tokens(text)                         from public, anon, authenticated;
revoke all on function public.fortnox_claim_refresh(text)                       from public, anon, authenticated;
revoke all on function public.fortnox_release_refresh(text)                     from public, anon, authenticated;

-- Automatisk kundmatchning: org.nr först, därefter exakt namn för privatkunder.
create or replace function public.fortnox_auto_match_customers(p_entity text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_org int := 0; v_name int := 0;
begin
  insert into public.fortnox_customer_map
    (legal_entity_code, makrilltrade_customer_id, fortnox_customer_number, match_method, confirmed)
  select distinct on (c.id) fc.legal_entity_code, c.id, fc.customer_number, 'org_number', false
  from public.fortnox_customers fc
  join public.customers_retail c
    on regexp_replace(coalesce(c.org_number,''), '\D', '', 'g') = fc.org_number_norm
  where fc.legal_entity_code = p_entity
    and fc.org_number_norm <> ''
    and fc.active
    and c.anonymized_at is null
  order by c.id, fc.customer_number
  on conflict do nothing;
  get diagnostics v_org = row_count;

  insert into public.fortnox_customer_map
    (legal_entity_code, makrilltrade_customer_id, fortnox_customer_number, match_method, confirmed)
  select distinct on (c.id) fc.legal_entity_code, c.id, fc.customer_number, 'name', false
  from public.fortnox_customers fc
  join public.customers_retail c
    on lower(btrim(coalesce(c.company_name, c.name, ''))) = lower(btrim(coalesce(fc.name,'')))
  where fc.legal_entity_code = p_entity
    and coalesce(fc.name,'') <> ''
    and fc.active
    and c.anonymized_at is null
  order by c.id, fc.customer_number
  on conflict do nothing;
  get diagnostics v_name = row_count;

  return v_org + v_name;
end $$;
revoke all on function public.fortnox_auto_match_customers(text) from public, anon, authenticated;

-- Momssats per bolag och produktkategori (samma logik som resolveVatRate i klienten).
create or replace function public.fortnox_vat_rate(p_entity text, p_category text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select v.rate from public.vat_rates v
      where v.legal_entity_id = p_entity
        and lower(btrim(v.category)) = lower(btrim(coalesce(p_category,'')))
        and coalesce(p_category,'') <> ''
      limit 1),
    (select v.rate from public.vat_rates v
      where v.legal_entity_id = p_entity and v.category = '*' limit 1),
    (select v.rate from public.vat_rates v
      where v.legal_entity_id is null and v.category = '*' limit 1),
    6
  );
$$;

-- Fakturaunderlag från en kundbeställning. Priser är inklusive moms (butikspris).
create or replace function public.fortnox_build_invoice_input(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_entity text;
begin
  select coalesce(public.company_of_store(o.store_id, o.wanted_date), s.legal_entity_id)
    into v_entity
  from public.customer_orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id;

  if v_entity is null then raise exception 'Order % saknar bolagstillhörighet', p_order_id; end if;

  select jsonb_build_object(
    'legal_entity_code', v_entity,
    'customer_id',       o.customer_id,
    'customer_number',   m.fortnox_customer_number,
    'order_number',      o.order_number,
    'invoice_date',      to_char(current_date, 'YYYY-MM-DD'),
    'due_date',          to_char(current_date + 30, 'YYYY-MM-DD'),
    'currency',          coalesce(o.currency, s.currency, 'SEK'),
    'vat_included',      true,
    'our_reference',     o.received_by_name,
    'your_reference',    coalesce(cr.contact_reference, o.customer_name_snapshot),
    'remarks',           o.note,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',     ol.product_id,
        'article_number', coalesce(p.sku, 'MKR-' || left(replace(ol.product_id::text,'-',''), 20)),
        'description',    coalesce(nullif(ol.free_text_name,''), p.name, 'Vara'),
        'quantity',       coalesce(ol.quantity_packed, ol.quantity_ordered),
        'unit',           coalesce(ol.unit, p.unit, 'kg'),
        'price',          coalesce(ol.price_per_unit, ol.estimated_price_per_unit, 0),
        'vat_rate',       public.fortnox_vat_rate(v_entity, p.category),
        'ean',            p.barcode,
        'hs_code',        p.hs_code,
        'cost_center',    null
      ) order by ol.sort_order nulls last, ol.created_at)
      from public.customer_order_lines ol
      left join public.products p on p.id = ol.product_id
      where ol.customer_order_id = o.id
        and coalesce(ol.pack_status,'') <> 'struken'
        and coalesce(ol.quantity_packed, ol.quantity_ordered) > 0
    ), '[]'::jsonb)
  )
  into v
  from public.customer_orders o
  join public.stores s on s.id = o.store_id
  left join public.customers_retail cr on cr.id = o.customer_id
  left join public.fortnox_customer_map m
    on m.makrilltrade_customer_id = o.customer_id and m.legal_entity_code = v_entity
  where o.id = p_order_id;

  if v is null then raise exception 'Order % hittades inte', p_order_id; end if;
  return v;
end $$;
revoke all on function public.fortnox_build_invoice_input(uuid) from public, anon, authenticated;

-- Körs först när Fortnox bekräftat fakturan. Idempotent: rader som redan bokfördes
-- vid packning (movement_id satt) rörs inte, och referensen hindrar dubbletter.
create or replace function public.fortnox_on_invoice_created(
  p_order_id uuid, p_entity text, p_document_number text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_location uuid; v_store uuid;
begin
  select o.store_id into v_store from public.customer_orders o where o.id = p_order_id;
  if v_store is null then raise exception 'Order % hittades inte', p_order_id; end if;

  select coalesce(
    (select s.inventory_location_id from public.stores s where s.id = v_store),
    (select l.id from public.storage_locations l
      where l.store_id = v_store and l.active and l.parent_location_id is null
      order by l.created_at limit 1)
  ) into v_location;

  if v_location is not null then
    insert into public.stock_movements
      (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
       reference_type, reference_id, note, legal_entity_id)
    select ol.product_id, v_location, ol.reserved_lot_id, 'kundorder',
           -abs(coalesce(ol.quantity_packed, ol.quantity_ordered)), ol.cost_at_order,
           'fortnox_invoice', p_order_id,
           'Fortnox faktura ' || p_document_number, p_entity
    from public.customer_order_lines ol
    where ol.customer_order_id = p_order_id
      and ol.product_id is not null
      and ol.movement_id is null
      and coalesce(ol.pack_status,'') <> 'struken'
      and coalesce(ol.quantity_packed, ol.quantity_ordered) > 0
      and not exists (
        select 1 from public.stock_movements sm
        where sm.reference_type = 'fortnox_invoice'
          and sm.reference_id = p_order_id
          and sm.product_id = ol.product_id
      );
  end if;

  insert into public.customer_order_events (customer_order_id, event_type, description, new_value)
  select p_order_id, 'fakturerad', 'Faktura ' || p_document_number || ' skapad i Fortnox (' || p_entity || ')',
         jsonb_build_object('document_number', p_document_number, 'legal_entity_code', p_entity)
  where not exists (
    select 1 from public.customer_order_events e
    where e.customer_order_id = p_order_id
      and e.event_type = 'fakturerad'
      and e.new_value->>'document_number' = p_document_number
  );
end $$;
revoke all on function public.fortnox_on_invoice_created(uuid,text,text) from public, anon, authenticated;

select cron.unschedule('fortnox-refresh-tokens') where exists (select 1 from cron.job where jobname = 'fortnox-refresh-tokens');
select cron.schedule(
  'fortnox-refresh-tokens',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fortnox_functions_url') || '/fortnox-refresh',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fortnox_cron_secret')),
    body    := '{}'::jsonb
  );
  $$
);

select cron.unschedule('fortnox-clean-oauth-states') where exists (select 1 from cron.job where jobname = 'fortnox-clean-oauth-states');
select cron.schedule('fortnox-clean-oauth-states', '15 3 * * *',
  $$ delete from public.fortnox_oauth_states where expires_at < now() - interval '1 day'; $$);