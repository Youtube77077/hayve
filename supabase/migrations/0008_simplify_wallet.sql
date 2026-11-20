-- Hayve Pay is an internal wallet: a balance people top up through the payment provider's
-- checkout and spend across Hayve. Tap to Pay, the Hayve Card, bank connections and Wave Back
-- boosts were removed from the product. Their tables were never used in production (no live
-- database existed when they were removed), so they are dropped here. The ledger
-- (accounts / ledger_entries / transactions) is untouched.

drop table if exists public.tap_payments cascade;
drop table if exists public.cards cascade;
drop table if exists public.linked_banks cascade;
drop table if exists public.wave_back_boosts cascade;
drop function if exists public.tap_receiver_fee(integer);
drop function if exists private.guard_tap_status() cascade;
drop function if exists private.guard_card() cascade;
alter table public.app_settings drop column if exists tap_to_pay;

-- Wave Back: only Hayve purchases paid from the balance (Shop, and Ride/Bites/Drive/Stay).
update public.app_settings set wave_back = wave_back - 'tapHayveRate' - 'tapCardRate' - 'cardPartnerRate' - 'cardOtherRate';

-- Payment methods: 'bank' rows are payout accounts for withdrawals; cards are entered in the
-- provider's checkout each time and never stored.
alter table public.payment_methods drop constraint if exists payment_methods_bank_fields;
alter table public.payment_methods drop column if exists connection, drop column if exists rail, drop column if exists funding, drop column if exists expiry;

-- Splits: no names; a number of people (incl. the requester) or null for "I'm not sure".
comment on column public.pay_requests.split is '{"people": number|null, "totalCents": number?, "cashPaid": number}';

-- The public view of a link: payers never see who else paid or how many have.
drop function if exists public.pay_request_public(text);
create function public.pay_request_public(token text)
returns table (id text, kind text, title text, amount_cents integer, currency text, status text, expires_at timestamptz, requester_name text, business jsonb, ref_label text, is_split boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.title, r.amount_cents, r.currency,
    case
      when r.cancelled_at is not null then 'cancelled'
      when not r.reusable and (
        (r.split is not null and (r.split ->> 'people') is not null and
          (select count(*) from public.pay_request_payments p where p.request_id = r.id and p.status in ('paid', 'captured'))
          + coalesce((r.split ->> 'cashPaid')::int, 0) >= (r.split ->> 'people')::int - 1)
        or (r.split is null and exists (select 1 from public.pay_request_payments p where p.request_id = r.id and p.status in ('paid', 'held', 'captured')))
      ) then 'paid'
      when now() > r.expires_at then 'expired'
      else 'pending'
    end,
    r.expires_at, p.display_name, r.business, r.ref ->> 'label', r.split is not null
  from public.pay_requests r join public.profiles p on p.id = r.requester_id
  where r.id = token;
$$;
grant execute on function public.pay_request_public(text) to anon, authenticated;

-- Top-ups confirmed by the provider are recorded once per provider reference.
alter table public.transactions add column if not exists provider_ref text unique;
