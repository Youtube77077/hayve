-- Tap to Pay, Hayve Card, linked banks, Wave Back boosts.
-- Card data is never stored: only the issuer/provider references and the last 4 digits.

alter type public.tx_type add value if not exists 'tap_payment';
alter type public.tx_type add value if not exists 'card_purchase';
alter type public.tx_type add value if not exists 'auto_topup';

-- Identity check through the payment partner (Tap to Pay, Hayve Card).
alter table public.profiles
  add column kyc_status text check (kyc_status in ('pending', 'verified', 'rejected')),
  add column kyc_verified_at timestamptz;

-- Settings: Tap to Pay values and the new Wave Back rates (admin-editable, never shown as % to users).
alter table public.app_settings
  add column tap_to_pay jsonb not null default '{"receiverFeeRate":0.025,"privateMonthlyLimitCents":250000,"maxPaymentCents":50000,"refundWindowDays":30,"claimWindowHours":24}'::jsonb;
update public.app_settings set wave_back = '{"tapHayveRate":0.01,"tapCardRate":0.005,"cardPartnerRate":0.01,"cardOtherRate":0.001}'::jsonb || wave_back;

create or replace function public.tap_receiver_fee(amount integer)
returns integer language sql stable security definer set search_path = public as $$
  select round(amount * coalesce((select (tap_to_pay ->> 'receiverFeeRate')::numeric from public.app_settings limit 1), 0.025))::integer;
$$;

-- ------------------------------------------------------------ Tap to Pay --
create table public.tap_payments (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references auth.users (id),
  amount_cents integer not null check (amount_cents >= 50),
  fee_cents integer not null check (fee_cents >= 0),
  note text not null default '' check (char_length(note) <= 80),
  status text not null default 'awaiting_tap' check (status in ('awaiting_tap', 'pending', 'available', 'refunded', 'cancelled', 'failed')),
  payer_method text check (payer_method in ('card', 'apple_pay', 'google_pay', 'hayve_card', 'hayve_balance')),
  card_brand text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  payer_user_id uuid references auth.users (id),
  payment_tx uuid references public.transactions (id),
  provider_ref text unique,
  receipt_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  wave_back_cents integer,
  wave_back_claimable boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  settle_at timestamptz,
  refunded_at timestamptz,
  check (payer_user_id is null or payer_user_id <> receiver_id)
);
create index tap_payments_receiver on public.tap_payments (receiver_id, created_at desc);
alter table public.tap_payments enable row level security;

-- The receiver sees their payments; a payer sees payments they made with Hayve (never card data of others).
create policy tap_read on public.tap_payments for select using (receiver_id = auth.uid() or payer_user_id = auth.uid() or public.is_admin());
-- Receivers can only create a charge that is waiting for a tap, with the fee from settings.
create policy tap_create on public.tap_payments for insert with check (receiver_id = auth.uid() and status = 'awaiting_tap' and payer_user_id is null and payment_tx is null and fee_cents = public.tap_receiver_fee(amount_cents));
create policy tap_cancel on public.tap_payments for update using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());

-- Only the payment provider (webhook, privileged connection) can mark a payment paid, settled or refunded.
create or replace function private.guard_tap_status()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not (old.status = 'awaiting_tap' and new.status = 'cancelled') then
      raise exception 'Payments are confirmed by the payment provider only' using errcode = '42501';
    end if;
    if (new.amount_cents, new.fee_cents, new.payer_user_id, new.payment_tx, new.provider_ref) is distinct from (old.amount_cents, old.fee_cents, old.payer_user_id, old.payment_tx, old.provider_ref) then
      raise exception 'Payment details cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tap_payments_guard before update on public.tap_payments for each row execute function private.guard_tap_status();

-- ------------------------------------------------------------ Hayve Card --
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  issuer_ref text not null unique,
  network text not null default 'Visa',
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month smallint not null check (exp_month between 1 and 12),
  exp_year smallint not null,
  status text not null default 'active' check (status in ('active', 'frozen', 'replaced')),
  kind text not null default 'virtual' check (kind in ('virtual', 'physical')),
  physical jsonb,
  limits jsonb not null default '{"dailyCents":100000,"monthlyCents":500000}'::jsonb,
  blocks jsonb not null default '{"online":false,"contactless":false,"gambling":true}'::jsonb,
  auto_top_up jsonb not null default '{"enabled":true,"amountCents":5000}'::jsonb,
  wallets jsonb not null default '{"apple":false,"google":false}'::jsonb,
  pin_set boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index cards_one_live on public.cards (user_id) where status <> 'replaced';
alter table public.cards enable row level security;
create policy cards_owner_read on public.cards for select using (user_id = auth.uid() or public.is_admin());
create policy cards_owner_controls on public.cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Owners may freeze/unfreeze and change controls; issuing fields come only from the issuer.
create or replace function private.guard_card()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.issuer_ref, new.last4, new.exp_month, new.exp_year, new.user_id, new.network, new.kind) is distinct from (old.issuer_ref, old.last4, old.exp_month, old.exp_year, old.user_id, old.network, old.kind) then
      raise exception 'Card details are managed by the card issuer' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (old.status in ('active', 'frozen') and new.status in ('active', 'frozen')) then
      raise exception 'Only freeze or unfreeze is allowed here' using errcode = '42501';
    end if;
    if (new.limits ->> 'dailyCents')::int > (new.limits ->> 'monthlyCents')::int then
      raise exception 'The monthly limit must be at least the daily limit' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger cards_guard before update on public.cards for each row execute function private.guard_card();

-- ------------------------------------------------------------ Linked banks --
create table public.linked_banks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  holder text not null,
  iban_last4 text not null check (iban_last4 ~ '^[0-9A-Z]{4}$'),
  bank text not null,
  method text not null check (method in ('ideal_wero', 'sepa_debit')),
  mandate_ref text not null unique,
  linked_at timestamptz not null default now()
);
alter table public.linked_banks enable row level security;
create policy banks_owner on public.linked_banks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- Wave Back boosts --
create table public.wave_back_boosts (
  id uuid primary key default gen_random_uuid(),
  merchant text not null check (char_length(merchant) between 2 and 120),
  rate numeric not null check (rate > 0 and rate <= 0.2),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.wave_back_boosts enable row level security;
create policy boosts_read on public.wave_back_boosts for select using (true);
create policy boosts_admin on public.wave_back_boosts for all using (public.is_admin()) with check (public.is_admin() and created_by = auth.uid());
