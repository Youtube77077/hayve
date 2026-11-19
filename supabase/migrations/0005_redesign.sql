-- Hayve redesign: fee tiers, Wave Back, wishlist visibility, Hayve Store verification,
-- owner admin, admin safeguards, audit log, reports.

-- ------------------------------------------------------------- settings --
-- One row. Everyone can read (fees are shown at checkout); only admins can change it.
create table public.app_settings (
  id boolean primary key default true check (id),
  fee_tiers jsonb not null default '[{"upTo":5000,"rate":0.05},{"upTo":25000,"rate":0.04},{"upTo":100000,"rate":0.03},{"upTo":null,"rate":0.02}]'::jsonb,
  wave_back jsonb not null default '{"shopRate":0.01,"shopMaxPerPurchaseCents":500,"servicesRate":0.02,"newUserRate":0.05,"newUserDays":30,"newUserMaxTotalCents":1000,"monthlyMaxCents":2000}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
create policy settings_read on public.app_settings for select using (true);
create policy settings_admin on public.app_settings for update using (public.is_admin()) with check (public.is_admin());

-- Marketplace fee from the tier table. The fee never goes down as the price goes up:
-- above a tier boundary the fee is at least the fee at the end of the previous tier
-- (EUR 250 -> 10.00, EUR 260 -> max(10.40 * 0.03 ...) = 10.00).
create or replace function public.marketplace_fee(price integer)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  t jsonb;
  v_rate numeric;
  v_floor integer := 0;
  v_prev integer := 0;
begin
  if price is null or price <= 0 then return 0; end if;
  for t in select value from jsonb_array_elements((select fee_tiers from public.app_settings limit 1)) loop
    if t->>'upTo' is null or price <= (t->>'upTo')::integer then
      v_rate := (t->>'rate')::numeric;
      return greatest(round(price * v_rate)::integer, v_floor);
    end if;
    v_floor := greatest(v_floor, round((t->>'upTo')::integer * (t->>'rate')::numeric)::integer);
    v_prev := (t->>'upTo')::integer;
  end loop;
  return v_floor;
end $$;

-- Older code paths call protection_fee(); keep the name, use the tiers.
create or replace function public.protection_fee(price integer)
returns integer language sql stable as $$ select public.marketplace_fee(price) $$;

alter type public.tx_type add value if not exists 'wave_back';

-- ------------------------------------------------------- profiles/wishlist --
alter table public.profiles
  add column wishlist_visibility text not null default 'public' check (wishlist_visibility in ('public', 'link', 'private')),
  add column wishlist_token text not null default encode(gen_random_bytes(12), 'hex'),
  add column avatar_thumb_url text,
  add column suspended_at timestamptz,
  add column suspension_reason text;
update public.profiles set wishlist_visibility = case when wishlist_public then 'public' else 'private' end;
alter table public.profiles drop constraint if exists profiles_bio_check;
update public.profiles set bio = left(bio, 200) where char_length(bio) > 200;
alter table public.profiles add constraint profiles_bio_check check (char_length(bio) <= 200);
-- Picture URLs must point at object storage (Spaces CDN), never inline data.
alter table public.profiles add constraint profiles_avatar_url check (avatar_url is null or avatar_url ~ '^https://');
alter table public.profiles add constraint profiles_avatar_thumb_url check (avatar_thumb_url is null or avatar_thumb_url ~ '^https://');

-- Keep the legacy flag in step for older readers.
create or replace function private.sync_wishlist_public()
returns trigger language plpgsql as $$
begin
  new.wishlist_public := new.wishlist_visibility = 'public';
  return new;
end $$;
create trigger profiles_wishlist_public before insert or update of wishlist_visibility on public.profiles
  for each row execute function private.sync_wishlist_public();

create or replace function private.can_view_wishlist(p public.profiles, p_token text)
returns boolean language sql stable as $$
  select p.id = auth.uid()
      or (p.is_public and p.wishlist_visibility = 'public')
      or (p.wishlist_visibility = 'link' and p_token is not null and p_token = p.wishlist_token);
$$;

drop function public.wishlist_for(text);
create function public.wishlist_for(p_username text, p_token text default null)
returns table (
  item_id uuid, product_id uuid, title text, image text, price_cents integer, item_position integer,
  status text, can_buy boolean, can_gift boolean, gift_blocked_reason text
)
language plpgsql stable security definer set search_path = public, private as $$
declare
  v_owner uuid;
  v_public boolean;
  v_profile public.profiles%rowtype;
  v_viewer uuid := auth.uid();
  v_has_address boolean;
begin
  select * into v_profile from public.profiles p where p.username = lower(p_username);
  v_owner := v_profile.id;
  v_public := v_owner is not null and private.can_view_wishlist(v_profile, p_token);
  if v_owner is null then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  if not v_public and v_viewer is distinct from v_owner then return; end if;
  select exists (select 1 from public.addresses a where a.user_id = v_owner and a.is_default) into v_has_address;

  return query
  with base as (
    select w.id, w.product_id, pr.title, pr.images[1] as image, pr.price_cents, w.position, w.status as wstatus,
           pr.status as pstatus, pr.quantity, pr.seller_id,
           exists (select 1 from private.gift_reservations r where r.wishlist_item_id = w.id and r.expires_at > now()) as reserved
    from public.wishlist_items w join public.products pr on pr.id = w.product_id
    where w.owner_id = v_owner
  ), computed as (
    select b.*,
      case
        when b.wstatus = 'sold' then 'sold'
        when b.pstatus <> 'active' or b.quantity <= 0 then 'unavailable'
        -- The owner never learns that a gift checkout is in progress.
        when b.reserved and v_viewer is distinct from v_owner then 'reserved'
        else 'available'
      end as vstatus
    from base b
  )
  select c.id, c.product_id, c.title, c.image, c.price_cents, c.position, c.vstatus,
    (v_viewer is not null and v_viewer <> v_owner and c.vstatus = 'available' and c.seller_id <> v_viewer),
    (v_viewer is not null and v_viewer <> v_owner and c.vstatus = 'available' and c.seller_id <> v_viewer and v_has_address),
    case
      when v_viewer is null then 'Sign in to send a gift'
      when v_viewer = v_owner then 'This is your wishlist'
      when c.vstatus = 'sold' then 'Already sold'
      when c.vstatus = 'reserved' then 'Someone is checking out this item'
      when c.vstatus = 'unavailable' then 'No longer available'
      when c.seller_id = v_viewer then 'You can''t gift your own listing'
      when not v_has_address then 'Gifting is not available for this person yet'
      else null
    end
  from computed c
  order by c.position;
end $$;

drop function public.reserve_wishlist_gift(uuid);
create function public.reserve_wishlist_gift(p_item uuid, p_token text default null)
returns table (reservation_id uuid, expires_at timestamptz, total_cents integer)
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_viewer uuid := auth.uid();
  v_item public.wishlist_items%rowtype;
  v_product public.products%rowtype;
  v_owner public.profiles%rowtype;
  v_live_reservations integer;
  v_res uuid;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  if v_viewer is null then raise exception 'Please sign in' using errcode = '28000'; end if;

  -- Lock the wishlist row: concurrent reservations for the same item serialise here.
  select * into v_item from public.wishlist_items where id = p_item for update;
  if not found then raise exception 'Wishlist item not found' using errcode = 'P0002'; end if;

  select * into v_owner from public.profiles where id = v_item.owner_id;
  if not private.can_view_wishlist(v_owner, p_token) then raise exception 'This wishlist is private' using errcode = '42501'; end if;
  if v_item.owner_id = v_viewer then raise exception 'This is your wishlist'; end if;
  if v_item.status <> 'available' then raise exception 'Already sold'; end if;

  delete from private.gift_reservations where wishlist_item_id = p_item and gift_reservations.expires_at <= now();
  if exists (select 1 from private.gift_reservations where wishlist_item_id = p_item) then
    raise exception 'Someone is checking out this item';
  end if;

  select * into v_product from public.products where id = v_item.product_id for update;
  if v_product.status <> 'active' or v_product.quantity <= 0 then raise exception 'No longer available'; end if;
  if v_product.seller_id = v_viewer then raise exception 'You can''t gift your own listing'; end if;
  select count(*) into v_live_reservations
    from private.gift_reservations r join public.wishlist_items w on w.id = r.wishlist_item_id
    where w.product_id = v_product.id and r.expires_at > now();
  if v_product.quantity - v_live_reservations <= 0 then raise exception 'This item is being purchased by someone else right now'; end if;
  if not exists (select 1 from public.addresses where user_id = v_item.owner_id and is_default) then
    raise exception 'Gifting is not available for this person yet';
  end if;

  insert into private.gift_reservations (wishlist_item_id, purchaser_id, expires_at) values (p_item, v_viewer, v_exp) returning id into v_res;
  return query select v_res, v_exp, v_product.price_cents + 395 + public.marketplace_fee(v_product.price_cents);
end $$;

grant execute on function public.wishlist_for(text, text) to anon, authenticated;
grant execute on function public.reserve_wishlist_gift(uuid, text) to authenticated;

-- ------------------------------------------------------------- admins --
-- Admin access requires a second factor (Supabase aal2 / our API's equivalent claim).
create or replace function public.jwt_aal()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin') and public.jwt_aal() = 'aal2';
$$;

-- Only an existing admin can grant or revoke the admin role.
create or replace function private.guard_admin_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('hayve.bootstrap_owner', true), '') = 'on' then return coalesce(new, old); end if;
  if (tg_op = 'DELETE' and old.role = 'admin') or (tg_op <> 'DELETE' and new.role = 'admin') then
    if not public.is_admin() then raise exception 'Only an admin can change admin access' using errcode = '42501'; end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger user_roles_guard_admin before insert or update or delete on public.user_roles
  for each row execute function private.guard_admin_role();

-- The owner account gets the admin role when it signs up (no password is stored anywhere;
-- they sign in like everyone else, and admin access still needs email verification + 2FA).
create table private.owner_emails (email text primary key check (email = lower(email)));
insert into private.owner_emails values ('rojyarzakholi@gmail.com');

create or replace function private.grant_owner_admin()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if exists (select 1 from private.owner_emails o where o.email = lower(new.email)) then
    perform set_config('hayve.bootstrap_owner', 'on', true);
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
    perform set_config('hayve.bootstrap_owner', 'off', true);
  end if;
  return new;
end $$;
create trigger auth_users_owner_admin after insert on auth.users
  for each row execute function private.grant_owner_admin();

-- Every admin action is logged; the log is append-only.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id),
  action text not null,
  target_kind text not null,
  target_id text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
create policy audit_read on public.admin_audit_log for select using (public.is_admin());
create policy audit_write on public.admin_audit_log for insert with check (public.is_admin() and admin_id = auth.uid());

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('listing', 'user', 'review')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy reports_own on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------- Hayve Store --
alter table public.businesses
  add column address jsonb,
  add column owner_id_checked boolean not null default false,
  add column status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  add column rejection_reason text,
  add column submitted_at timestamptz not null default now(),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id),
  add column description text not null default '' check (char_length(description) <= 500),
  add column logo_url text check (logo_url is null or logo_url ~ '^https://'),
  add column banner_url text check (banner_url is null or banner_url ~ '^https://');
-- registration_number holds the 8-digit KVK number. NOT VALID: applies to new and changed rows.
alter table public.businesses add constraint businesses_kvk check (registration_number ~ '^[0-9]{8}$') not valid;
alter table public.businesses add constraint businesses_vat check (vat_number ~ '^NL[0-9]{9}B[0-9]{2}$') not valid;
alter table public.businesses add constraint businesses_rejection_reason check (status <> 'rejected' or char_length(coalesce(rejection_reason, '')) >= 3);

-- Owners can edit their application, but only admins can verify or reject it.
-- Any owner change to verification details sends it back to Pending.
create or replace function private.guard_business_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.reviewed_at := null; new.reviewed_by := null; new.rejection_reason := null;
    return new;
  end if;
  if new.status is distinct from old.status or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Only Hayve can change the verification status' using errcode = '42501';
  end if;
  if (new.legal_name, new.registration_number, new.vat_number, new.address, new.owner_id_checked) is distinct from (old.legal_name, old.registration_number, old.vat_number, old.address, old.owner_id_checked) then
    new.status := 'pending'; new.rejection_reason := null; new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger businesses_guard_status before insert or update on public.businesses
  for each row execute function private.guard_business_status();

create policy businesses_admin_update on public.businesses for update using (public.is_admin()) with check (public.is_admin());
-- Verified stores are public (store page, "From verified business" label).
create policy businesses_public_verified on public.businesses for select using (status = 'verified');

-- ------------------------------------------------------------ orders --
alter table public.orders
  add column delivery text not null default 'ship' check (delivery in ('ship', 'pickup')),
  add column shipment jsonb;
