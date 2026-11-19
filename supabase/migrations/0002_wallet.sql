-- Hayve Pay ledger. Balances are derived from immutable entries, never stored.
-- Money columns are integer euro cents. All movements are SIMULATED until a
-- licensed payment provider adapter is connected (see docs/PAYMENTS.md).

create type public.entry_status as enum ('posted', 'pending', 'held', 'voided');
create type public.tx_status as enum ('pending', 'completed', 'failed', 'refunded', 'reserved');
create type public.tx_type as enum ('deposit', 'withdrawal', 'p2p', 'purchase', 'sale', 'gift_purchase', 'food_order', 'ride', 'rental', 'stay', 'delivery', 'earning', 'refund', 'merchant_payment', 'fee');

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique references auth.users (id),
  kind text not null check (kind in ('user', 'system')),
  code text unique, -- system accounts: 'bank', 'card', 'fees', 'payouts', 'gift_escrow'
  label text not null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type public.tx_type not null,
  status public.tx_status not null,
  amount_cents integer not null check (amount_cents > 0),
  from_account uuid not null references public.ledger_accounts (id),
  to_account uuid not null references public.ledger_accounts (id),
  label_for_from text not null,
  label_for_to text not null,
  note text,
  ref_kind text,
  ref_id uuid,
  method text not null check (method in ('wallet', 'card', 'bank', 'system')),
  funding_tx uuid references public.transactions (id),
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tx_id uuid not null references public.transactions (id),
  account_id uuid not null references public.ledger_accounts (id),
  amount_cents integer not null,
  status public.entry_status not null,
  created_at timestamptz not null default now()
);
create index ledger_entries_account on public.ledger_entries (account_id, status);
create index ledger_entries_tx on public.ledger_entries (tx_id);

-- Entries are append-only except for status transitions performed by
-- security definer functions (capture / void / release).
create or replace function public.forbid_entry_amount_change()
returns trigger language plpgsql as $$
begin
  if new.amount_cents <> old.amount_cents or new.account_id <> old.account_id or new.tx_id <> old.tx_id then
    raise exception 'ledger entries are immutable';
  end if;
  return new;
end $$;
create trigger ledger_entries_immutable before update on public.ledger_entries for each row execute function public.forbid_entry_amount_change();

create or replace function public.wallet_balances(acc uuid)
returns table (available_cents bigint, pending_cents bigint, reserved_cents bigint)
language sql stable as $$
  select
    coalesce(sum(amount_cents) filter (where status in ('posted', 'held')), 0),
    coalesce(sum(amount_cents) filter (where status = 'pending'), 0),
    coalesce(-sum(amount_cents) filter (where status = 'held'), 0)
  from public.ledger_entries where account_id = acc;
$$;

create or replace function public.my_wallet()
returns table (available_cents bigint, pending_cents bigint, reserved_cents bigint)
language sql stable security definer set search_path = public as $$
  select b.* from public.ledger_accounts a, lateral public.wallet_balances(a.id) b where a.owner_id = auth.uid();
$$;

create table public.money_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id),
  payer_id uuid not null references auth.users (id),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'paid', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  check (requester_id <> payer_id)
);

alter table public.ledger_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.money_requests enable row level security;

create or replace function public.my_account_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.ledger_accounts where owner_id = auth.uid();
$$;

create policy accounts_owner on public.ledger_accounts for select using (owner_id = auth.uid() or public.is_admin());
-- A user sees the entries on their own account only (never the counterparty's entries).
create policy entries_owner on public.ledger_entries for select using (account_id = public.my_account_id() or public.is_admin());
-- Transactions are visible to the two sides. Clients render the label meant for
-- their side; gift purchases label the seller side "Hayve Gift".
create policy transactions_parties on public.transactions for select using (from_account = public.my_account_id() or to_account = public.my_account_id() or public.is_admin());
-- No direct writes: money only moves through security definer RPCs.

create policy requests_parties on public.money_requests for select using (requester_id = auth.uid() or payer_id = auth.uid());
create policy requests_create on public.money_requests for insert with check (requester_id = auth.uid());
create policy requests_respond on public.money_requests for update using (requester_id = auth.uid() or payer_id = auth.uid());

-- System accounts.
insert into public.ledger_accounts (kind, code, label) values
  ('system', 'bank', 'Bank transfer (simulated)'),
  ('system', 'card', 'Card (simulated)'),
  ('system', 'fees', 'Hayve'),
  ('system', 'payouts', 'Payout (simulated)'),
  ('system', 'gift_escrow', 'Hayve Gift');
