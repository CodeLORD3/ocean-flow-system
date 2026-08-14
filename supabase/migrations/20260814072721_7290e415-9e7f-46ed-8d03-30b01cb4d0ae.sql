create table if not exists public.shopify_oauth_tokens (
  shop text primary key,
  access_token text not null,
  scope text,
  access_mode text not null default 'offline',
  updated_at timestamptz not null default now()
);
grant all on public.shopify_oauth_tokens to service_role;
alter table public.shopify_oauth_tokens enable row level security;

create table if not exists public.shopify_oauth_states (
  state text primary key,
  shop text not null,
  created_at timestamptz not null default now()
);
grant all on public.shopify_oauth_states to service_role;
alter table public.shopify_oauth_states enable row level security;