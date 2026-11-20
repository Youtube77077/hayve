-- Payment requests and links (pay without a Hayve account), connected banks and cards,
-- Hayve Ride dispatch (one driver at a time) and the driver commission.
-- Card numbers are never stored: only brand, last 4, expiry and debit/credit from the payment partner.

alter type public.tx_type add value if not exists 'request_payment';

-- --------------------------------------------------- Cards and banks --
alter table public.payment_methods
  add column funding text check (funding in ('debit', 'credit')),
  add column expiry text check (expiry is null or expiry ~ '^(0[1-9]|1[0-2])/[0-9]{2}$'),
  add column bank text,
  add column connection text check (connection in ('ideal_wero', 'sepa_debit'));
alter table public.payment_methods add constraint payment_methods_bank_fields check (kind = 'bank' or (bank is null and connection is null));

-- -------------------------------------------------------------- Settings --
alter table public.app_settings
  add column pay_requests jsonb not null default '{"businessFeeRate":0.012,"businessFeeFixedCents":20,"defaultExpiryDays":14,"maxExpiryDays":90,"maxSplitPeople":20}'::jsonb,
  add column ride jsonb not null default '{"commissionRate":0.15,"offerSeconds":15}'::jsonb;

create or replace function public.request_business_fee(amount integer)
returns integer language sql stable security definer set search_path = public as $$
  select least(amount - 1, round(amount * coalesce((select (pay_requests ->> 'businessFeeRate')::numeric from public.app_settings limit 1), 0.012))::integer
    + coalesce((select (pay_requests ->> 'businessFeeFixedCents')::integer from public.app_settings limit 1), 20));
$$;

create or replace function public.ride_hayve_cents(price integer)
returns integer language sql stable security definer set search_path = public as $$
  select round(price * coalesce((select (ride ->> 'commissionRate')::numeric from public.app_settings limit 1), 0.15))::integer;
$$;

-- ------------------------------------------------------ Payment requests --
-- The id is a random token used in the shared link: knowing the link is the permission to pay.
create table public.pay_requests (
  id text primary key default encode(gen_random_bytes(16), 'hex'),
  requester_id uuid not null references auth.users (id),
  kind text not null check (kind in ('personal', 'split', 'business', 'deposit')),
  title text not null check (char_length(title) between 2 and 80),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  reusable boolean not null default false,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  split jsonb,
  business jsonb,
  ref jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '365 days'),
  check ((kind = 'split') = (split is not null)),
  check ((kind = 'business') = (business is not null)),
  check (kind <> 'deposit' or ref is not null),
  check (not reusable or kind in ('personal', 'business'))
);
create index pay_requests_requester on public.pay_requests (requester_id, created_at desc);
alter table public.pay_requests enable row level security;

create policy requests_owner_read on public.pay_requests for select using (requester_id = auth.uid() or public.is_admin());
-- Business requests only for verified Hayve Store businesses.
create policy requests_create on public.pay_requests for insert with check (
  requester_id = auth.uid() and cancelled_at is null
  and (kind <> 'business' or exists (select 1 from public.businesses b where b.owner_id = auth.uid() and b.status = 'verified'))
);
create policy requests_owner_update on public.pay_requests for update using (requester_id = auth.uid()) with check (requester_id = auth.uid());

-- Owners may cancel and mark split shares paid in cash; nothing else changes after creation.
create or replace function private.guard_pay_request()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.requester_id, new.kind, new.title, new.amount_cents, new.reusable, new.expires_at, new.business, new.ref, new.created_at)
       is distinct from (old.requester_id, old.kind, old.title, old.amount_cents, old.reusable, old.expires_at, old.business, old.ref, old.created_at) then
      raise exception 'A request cannot be changed once shared. Cancel it and create a new one.' using errcode = '42501';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'A cancelled request stays cancelled' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger pay_requests_guard before update on public.pay_requests for each row execute function private.guard_pay_request();

-- Payments against a request. Written only by the payment provider (privileged connection),
-- so a payer can never mark a request paid without money moving.
create table public.pay_request_payments (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.pay_requests (id),
  payment_tx uuid references public.transactions (id),
  payer_id uuid references auth.users (id),
  payer_name text not null check (char_length(payer_name) between 2 and 60),
  method text not null check (method in ('bank', 'card', 'hayve')),
  method_label text not null,
  amount_cents integer not null check (amount_cents > 0),
  fee_cents integer not null default 0 check (fee_cents >= 0 and fee_cents < amount_cents),
  share_id text,
  status text not null check (status in ('paid', 'held', 'released', 'captured', 'refunded')),
  provider_ref text unique,
  created_at timestamptz not null default now()
);
create index pay_request_payments_request on public.pay_request_payments (request_id);
alter table public.pay_request_payments enable row level security;
create policy request_payments_read on public.pay_request_payments for select using (
  payer_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.pay_requests r where r.id = request_id and r.requester_id = auth.uid())
);

-- What anyone with the link sees. Never who else paid or how.
create or replace function public.pay_request_public(token text)
returns table (id text, kind text, title text, amount_cents integer, status text, expires_at timestamptz, requester_name text, business jsonb, ref_label text, shares jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.title, r.amount_cents,
    case
      when r.cancelled_at is not null then 'cancelled'
      when not r.reusable and (
        (r.split is not null and not exists (select 1 from jsonb_array_elements(r.split -> 'shares') s where coalesce((s ->> 'you')::boolean, false) = false and s ->> 'paidAt' is null))
        or (r.split is null and exists (select 1 from public.pay_request_payments p where p.request_id = r.id and p.status in ('paid', 'held', 'captured')))
      ) then 'paid'
      when now() > r.expires_at then 'expired'
      else 'pending'
    end,
    r.expires_at, p.display_name, r.business, r.ref ->> 'label',
    (select jsonb_agg(jsonb_build_object('id', s ->> 'id', 'name', s ->> 'name', 'paid', s ->> 'paidAt' is not null))
       from jsonb_array_elements(coalesce(r.split -> 'shares', '[]'::jsonb)) s where coalesce((s ->> 'you')::boolean, false) = false)
  from public.pay_requests r join public.profiles p on p.id = r.requester_id
  where r.id = token;
$$;
grant execute on function public.pay_request_public(text) to anon, authenticated;

-- --------------------------------------------------------- Ride dispatch --
alter table public.drivers add column location jsonb;
alter table public.rides
  add column offer jsonb,
  add column offers jsonb not null default '[]'::jsonb,
  add column payout jsonb;

-- Drivers only see a requested ride while it is offered to them (one driver at a time).
drop policy rides_parties on public.rides;
create policy rides_parties on public.rides for select using (
  rider_id = auth.uid() or driver_id = auth.uid() or (status = 'requested' and offer ->> 'driverId' = auth.uid()::text) or public.is_admin()
);

-- Dispatch, payouts and fares are set by the server, never by a rider or driver directly.
create or replace function private.guard_ride_dispatch()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.offer, new.offers, new.payout, new.price_cents, new.rider_id) is distinct from (old.offer, old.offers, old.payout, old.price_cents, old.rider_id) then
      raise exception 'Dispatch and fares are managed by Hayve' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger rides_guard_dispatch before update on public.rides for each row execute function private.guard_ride_dispatch();
