-- Hayve services: Bites, Ride, Drive, Stay, Send, Business.

create type public.booking_status as enum ('requested', 'confirmed', 'declined', 'active', 'completed', 'cancelled');

-- ------------------------------------------------------------- Bites --
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  name text not null,
  cuisine text not null,
  description text not null default '',
  image_url text,
  rating numeric(3, 2) not null default 5,
  rating_count integer not null default 0,
  delivery_fee_cents integer not null default 199,
  min_order_cents integer not null default 1000,
  eta_min integer not null default 30,
  price_level smallint not null default 2 check (price_level between 1 and 3),
  tags text[] not null default '{}',
  address text not null,
  is_open boolean not null default false,
  is_grocery boolean not null default false,
  promo text,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 50),
  image_url text,
  category text not null,
  available boolean not null default true,
  popular boolean not null default false,
  options jsonb not null default '[]'::jsonb
);

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references auth.users (id),
  restaurant_id uuid not null references public.restaurants (id),
  courier_id uuid references auth.users (id),
  lines jsonb not null,
  subtotal_cents integer not null,
  delivery_fee_cents integer not null,
  service_fee_cents integer not null,
  total_cents integer not null,
  address text not null,
  note text not null default '',
  status text not null check (status in ('placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'rejected', 'cancelled')),
  payment_tx uuid references public.transactions (id),
  rating smallint,
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- Ride --
create table public.drivers (
  user_id uuid primary key references auth.users (id),
  vehicle jsonb not null,
  license_number text not null,
  online boolean not null default false,
  rating numeric(3, 2) not null default 5,
  trips integer not null default 0
);

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users (id),
  driver_id uuid references auth.users (id),
  pickup jsonb not null,
  dropoff jsonb not null,
  category text not null,
  price_cents integer not null,
  distance_km numeric(6, 1) not null,
  duration_min integer not null,
  status text not null check (status in ('requested', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled')),
  declined_by uuid[] not null default '{}',
  rating smallint,
  payment_tx uuid references public.transactions (id),
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.couriers (
  user_id uuid primary key references auth.users (id),
  vehicle text not null check (vehicle in ('bike', 'e-bike', 'scooter', 'car', 'van')),
  online boolean not null default false,
  rating numeric(3, 2) not null default 5,
  jobs integer not null default 0
);

-- ------------------------------------------------------------- Drive --
create table public.rental_vehicles (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id),
  make text not null,
  model text not null,
  year integer not null,
  type text not null,
  seats integer not null,
  doors integer not null,
  transmission text not null check (transmission in ('automatic', 'manual')),
  fuel text not null,
  range_km integer,
  price_per_day_cents integer not null check (price_per_day_cents >= 1500),
  images text[] not null,
  location text not null,
  features text[] not null default '{}',
  requirements jsonb not null,
  listed boolean not null default true,
  blocked_dates date[] not null default '{}',
  rating numeric(3, 2) not null default 0,
  trips integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  vehicle_id uuid not null references public.rental_vehicles (id),
  renter_id uuid not null references auth.users (id),
  host_id uuid not null references auth.users (id),
  pickup_location text not null,
  return_location text not null,
  starts_on date not null,
  ends_on date not null,
  days integer not null,
  total_cents integer not null,
  status public.booking_status not null,
  payment_tx uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

-- -------------------------------------------------------------- Stay --
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id),
  title text not null,
  type text not null check (type in ('apartment', 'room', 'house', 'holiday_home', 'studio')),
  city text not null,
  country text not null,
  neighbourhood text not null default '',
  description text not null,
  price_per_night_cents integer not null check (price_per_night_cents >= 1000),
  cleaning_fee_cents integer not null default 0,
  guests integer not null,
  bedrooms integer not null,
  beds integer not null,
  baths integer not null,
  amenities text[] not null default '{}',
  images text[] not null,
  rating numeric(3, 2) not null default 0,
  review_count integer not null default 0,
  instant_book boolean not null default false,
  listed boolean not null default true,
  blocked_dates date[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.saved_properties (
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table public.stay_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  property_id uuid not null references public.properties (id),
  guest_id uuid not null references auth.users (id),
  host_id uuid not null references auth.users (id),
  check_in date not null,
  check_out date not null,
  nights integer not null,
  guests integer not null,
  total_cents integer not null,
  status public.booking_status not null,
  payment_tx uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);

-- Double-booking protection at the database level.
create extension if not exists btree_gist;
alter table public.stay_bookings add constraint stay_no_overlap
  exclude using gist (property_id with =, daterange(check_in, check_out, '[)') with &&)
  where (status in ('requested', 'confirmed', 'active'));
alter table public.rentals add constraint rental_no_overlap
  exclude using gist (vehicle_id with =, daterange(starts_on, ends_on, '[]') with &&)
  where (status in ('requested', 'confirmed', 'active'));

-- -------------------------------------------------------------- Send --
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  sender_id uuid not null references auth.users (id),
  courier_id uuid references auth.users (id),
  pickup text not null,
  dropoff text not null,
  recipient_name text not null,
  recipient_phone text not null,
  size text not null check (size in ('S', 'M', 'L', 'XL')),
  weight_kg numeric(5, 2) not null,
  instructions text not null default '',
  speed text not null check (speed in ('standard', 'express', 'same_day')),
  price_cents integer not null,
  status text not null check (status in ('booked', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  declined_by uuid[] not null default '{}',
  payment_tx uuid references public.transactions (id),
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------- Business --
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id),
  legal_name text not null,
  trading_name text not null,
  category text not null,
  country text not null,
  registration_number text not null,
  vat_number text not null default '',
  website text not null default '',
  verification jsonb not null default '{"details": true, "identity": false, "bank": false, "status": "not_started"}'::jsonb,
  payout_schedule text not null default 'weekly' check (payout_schedule in ('daily', 'weekly', 'monthly')),
  created_at timestamptz not null default now()
);

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  amount_cents integer not null check (amount_cents >= 100),
  active boolean not null default true,
  payments integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS --
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.food_orders enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;
alter table public.couriers enable row level security;
alter table public.rental_vehicles enable row level security;
alter table public.rentals enable row level security;
alter table public.properties enable row level security;
alter table public.saved_properties enable row level security;
alter table public.stay_bookings enable row level security;
alter table public.deliveries enable row level security;
alter table public.businesses enable row level security;
alter table public.payment_links enable row level security;

create policy restaurants_read on public.restaurants for select using (true);
create policy restaurants_owner on public.restaurants for all using (owner_id = auth.uid() and public.has_role('kitchen')) with check (owner_id = auth.uid() and public.has_role('kitchen'));
create policy menu_read on public.menu_items for select using (true);
create policy menu_owner on public.menu_items for all
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy food_orders_parties on public.food_orders for select using (
  customer_id = auth.uid() or courier_id = auth.uid()
  or exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid())
  or (status = 'ready' and courier_id is null and public.has_role('courier'))
  or public.is_admin()
);

create policy drivers_self on public.drivers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rides_parties on public.rides for select using (
  rider_id = auth.uid() or driver_id = auth.uid() or (status = 'requested' and public.has_role('driver')) or public.is_admin()
);
create policy couriers_self on public.couriers for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy vehicles_read on public.rental_vehicles for select using (listed or host_id = auth.uid() or public.is_admin());
create policy vehicles_host on public.rental_vehicles for all using (host_id = auth.uid() and public.has_role('host')) with check (host_id = auth.uid() and public.has_role('host'));
create policy rentals_parties on public.rentals for select using (renter_id = auth.uid() or host_id = auth.uid() or public.is_admin());

create policy properties_read on public.properties for select using (listed or host_id = auth.uid() or public.is_admin());
create policy properties_host on public.properties for all using (host_id = auth.uid() and public.has_role('host')) with check (host_id = auth.uid() and public.has_role('host'));
create policy saved_properties_owner on public.saved_properties for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy stays_parties on public.stay_bookings for select using (guest_id = auth.uid() or host_id = auth.uid() or public.is_admin());

create policy deliveries_parties on public.deliveries for select using (
  sender_id = auth.uid() or courier_id = auth.uid() or (status = 'booked' and public.has_role('courier')) or public.is_admin()
);

create policy businesses_owner on public.businesses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy businesses_admin on public.businesses for select using (public.is_admin());
create policy payment_links_owner on public.payment_links for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
-- Customers open active payment links (public checkout page).
create policy payment_links_public on public.payment_links for select using (active);

-- State changes (accept order, dispatch ride, confirm booking, pay link …) go
-- through security definer RPCs mirroring src/backend/api/*, which validate
-- the state machine and move money in the same transaction.
