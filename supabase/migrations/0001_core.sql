-- Hayve core schema: accounts, profiles, roles, marketplace, social.
-- Target: Supabase (PostgreSQL 15+). Every table has row level security enabled.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums --
create type public.hayve_role as enum ('customer', 'seller', 'host', 'driver', 'courier', 'kitchen', 'merchant', 'admin');
create type public.product_category as enum ('fashion', 'electronics', 'home', 'accessories', 'collectibles', 'books', 'sport', 'general');
create type public.product_condition as enum ('new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory');
create type public.product_status as enum ('active', 'sold_out', 'removed');
create type public.notification_kind as enum ('order', 'sale', 'delivery', 'ride', 'rental', 'stay', 'payment', 'refund', 'message', 'business', 'security');

-- ------------------------------------------------------------- profiles --
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_url text,
  city text not null default '',
  account_type text not null default 'individual' check (account_type in ('individual', 'business')),
  is_public boolean not null default true,
  wishlist_public boolean not null default true,
  language text not null default 'en',
  currency text not null default 'EUR',
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.hayve_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Role helpers used by RLS policies (security definer so they can read user_roles).
create or replace function public.has_role(check_role public.hayve_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = check_role);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin');
$$;

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home',
  full_name text not null,
  line1 text not null,
  city text not null,
  postcode text not null,
  country text not null default 'Netherlands',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index addresses_one_default on public.addresses (user_id) where is_default;

-- Card / bank references only. Real card data never touches Hayve: the
-- payment provider returns a token + last4.
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('card', 'bank')),
  provider_token text,
  label text not null,
  last4 text not null check (last4 ~ '^[0-9A-Za-z]{4}$'),
  brand text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- products --
create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id),
  title text not null check (char_length(title) between 3 and 80),
  description text not null check (char_length(description) between 10 and 1000),
  price_cents integer not null check (price_cents between 100 and 5000000),
  category public.product_category not null,
  condition public.product_condition not null,
  brand text,
  size text,
  images text[] not null check (array_length(images, 1) between 1 and 8),
  quantity integer not null default 1 check (quantity >= 0),
  status public.product_status not null default 'active',
  location text not null default '',
  created_at timestamptz not null default now()
);
create index products_seller on public.products (seller_id);
create index products_browse on public.products (status, category, created_at desc);

create table public.favourites (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id),
  target_kind text not null check (target_kind in ('user', 'restaurant', 'property', 'vehicle', 'driver')),
  target_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ messaging --
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  context_kind text,
  context_id uuid,
  context_title text,
  last_message_at timestamptz not null default now()
);

create table public.thread_participants (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create or replace function public.is_participant(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.thread_participants where thread_id = t and user_id = auth.uid());
$$;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS --
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.payment_methods enable row level security;
alter table public.products enable row level security;
alter table public.favourites enable row level security;
alter table public.reviews enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: public profiles are readable by everyone; private ones only by their owner and admins.
create policy profiles_read on public.profiles for select using (is_public or id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Roles: users read their own; only admins grant/revoke (self-service partner
-- onboarding goes through security definer RPCs, not direct inserts).
create policy roles_read on public.user_roles for select using (user_id = auth.uid() or public.is_admin());
create policy roles_admin on public.user_roles for all using (public.is_admin()) with check (public.is_admin());

-- Addresses & payment methods: strictly private.
create policy addresses_owner on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy payment_methods_owner on public.payment_methods for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Products: anyone can browse non-removed listings; sellers manage their own.
create policy products_read on public.products for select using (status <> 'removed' or seller_id = auth.uid() or public.is_admin());
create policy products_insert on public.products for insert with check (seller_id = auth.uid());
create policy products_update on public.products for update using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());

create policy favourites_owner on public.favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_read on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (author_id = auth.uid());

create policy threads_read on public.threads for select using (public.is_participant(id));
create policy participants_read on public.thread_participants for select using (public.is_participant(thread_id));
create policy participants_update on public.thread_participants for update using (user_id = auth.uid());
create policy messages_read on public.messages for select using (public.is_participant(thread_id));
create policy messages_insert on public.messages for insert with check (sender_id = auth.uid() and public.is_participant(thread_id));

create policy notifications_owner_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_owner_update on public.notifications for update using (user_id = auth.uid());

create policy audit_admin on public.audit_log for select using (public.is_admin());
